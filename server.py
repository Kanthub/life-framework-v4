"""空我人生 · 本地服务器

提供网页，并把数据自动保存到本机文件 data/kongwo-data.json。
只监听 127.0.0.1，局域网和外网都访问不到。

用法：python server.py                    （默认端口 8765）
      python server.py 9000               （指定端口）
      python server.py 9000 --data D:	mp  （指定数据目录，测试用）
"""
import json
import os
import shutil
import socket
import sys
import tempfile
import threading
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DATA_FILE = BACKUP_DIR = ""


def set_data_dir(path):
    global DATA_DIR, DATA_FILE, BACKUP_DIR
    DATA_DIR = os.path.abspath(path)
    DATA_FILE = os.path.join(DATA_DIR, "kongwo-data.json")
    BACKUP_DIR = os.path.join(DATA_DIR, "backups")


set_data_dir(DATA_DIR)
KEEP_BACKUPS = 30                 # 每天一份快照，保留最近 30 天
MAX_BODY = 5 * 1024 * 1024        # 单次写入上限 5MB
ALLOWED_KEYS = {"lf4-domains", "kongwo-records", "kongwo-paper", "kongwo-geo", "kongwo-cards", "kongwo-fw-v", "kongwo-compass-style"}

_lock = threading.Lock()


def read_data():
    """读取数据文件；文件不存在或损坏时返回空字典（损坏的文件会先另存一份）。"""
    if not os.path.exists(DATA_FILE):
        return {}
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        broken = DATA_FILE + ".broken-" + datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(DATA_FILE, broken)
        print(f"[警告] 数据文件无法解析，已另存为 {broken}")
        return {}


def daily_backup():
    """当天第一次写入前，把旧文件复制一份到 backups/，并清理过期快照。"""
    if not os.path.exists(DATA_FILE):
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)
    target = os.path.join(BACKUP_DIR, "kongwo-data-" + datetime.now().strftime("%Y-%m-%d") + ".json")
    if not os.path.exists(target):
        shutil.copy2(DATA_FILE, target)
        snaps = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("kongwo-data-"))
        for old in snaps[:-KEEP_BACKUPS]:
            os.remove(os.path.join(BACKUP_DIR, old))


def write_data(data):
    """原子写入：先写临时文件再替换，避免写到一半断电导致文件损坏。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    daily_backup()
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # 数据接口 -------------------------------------------------------
    def do_GET(self):
        if self.path.split("?")[0] == "/api/data":
            with _lock:
                return self._json(200, {"ok": True, "data": read_data(), "file": DATA_FILE})
        # 不对外提供数据目录和服务器源码
        if self.path.startswith("/data/") or self.path.split("?")[0] == "/server.py":
            return self._json(404, {"ok": False})
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/data":
            return self._json(404, {"ok": False})
        # 只接受本页发出的请求，防止其他网站借你的浏览器改写数据
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{host}",):
            return self._json(403, {"ok": False, "error": "forbidden origin"})
        if self.headers.get("X-Kongwo") != "1":
            return self._json(403, {"ok": False, "error": "missing header"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"ok": False, "error": "bad size"})
        try:
            patch = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"ok": False, "error": "bad json"})
        if not isinstance(patch, dict):
            return self._json(400, {"ok": False, "error": "bad shape"})
        with _lock:
            data = read_data()
            for k, v in patch.items():
                if k not in ALLOWED_KEYS:
                    continue
                if v is None:
                    data.pop(k, None)
                elif isinstance(v, str):
                    data[k] = v
            data["_savedAt"] = datetime.now().isoformat(timespec="seconds")
            write_data(data)
        return self._json(200, {"ok": True, "savedAt": data["_savedAt"]})

    # 工具 -----------------------------------------------------------
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # 页面和脚本不缓存，改完刷新就能看到
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class ExclusiveServer(ThreadingHTTPServer):
    """Windows 上默认允许多个进程共用同一端口，这里改为独占，第二个实例会直接失败。"""
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


FALLBACK_PORTS = [8765, 18765, 28765, 38765, 48765, 5765, 6765, 7765]


def find_running(ports):
    """返回已在运行的空我人生端口（通过 /api/data 确认是自己，而不是别的程序）。"""
    import urllib.request
    # 本机探测不走系统代理：Windows 上查代理例外会做反向 DNS，可能卡上几秒
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for p in ports:
        try:
            with opener.open(f"http://127.0.0.1:{p}/api/data", timeout=1) as r:
                if r.status == 200 and json.loads(r.read().decode("utf-8")).get("ok"):
                    return p
        except Exception:
            continue
    return None


def main():
    args = sys.argv[1:]
    custom_data = "--data" in args
    if custom_data:
        i = args.index("--data")
        set_data_dir(args[i + 1])
        del args[i:i + 2]
    open_browser = "--open" in args
    if open_browser:
        args.remove("--open")
    port = int(args[0]) if args else 8765
    # 依次占端口：占得到就用；占不到时看看是不是空我人生自己已经在那儿跑着，是就直接打开它。
    # 首选端口可能被系统保留（Windows 的 Hyper-V/WSL 会动态保留一段端口），就换下一个。
    # 测试用的独立数据目录只用自己的端口，不去接管正式实例。
    server = None
    for p in [port] + ([] if custom_data else [x for x in FALLBACK_PORTS if x != port]):
        try:
            server = ExclusiveServer(("127.0.0.1", p), Handler)
            port = p
            break
        except OSError:
            if find_running([p]):
                url = f"http://localhost:{p}/"
                print(f"空我人生 已在运行：{url}")
                if open_browser:
                    webbrowser.open(url)
                sys.exit(3)
    if server is None:
        print("启动失败：没有可用端口。")
        sys.exit(1)
    url = f"http://localhost:{port}/"
    if open_browser:
        threading.Timer(0.6, webbrowser.open, args=(url,)).start()
    print(f"空我人生 已启动：{url}")
    print(f"数据文件：{DATA_FILE}")
    print("关闭这个窗口即停止服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
