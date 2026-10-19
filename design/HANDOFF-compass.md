# 交接：三套罗盘 + 切换器（进行中）

项目：空我人生，水墨风人生框架 Web 应用。目录 `C:\Users\Kant\WorkBuddy\空我之旅\life-framework-v4 - 副本`（不是 git 仓库）。`server.py` 把数据存到 `data/kongwo-data.json`。

## 目标
把 `design/compass-options.html` 里的三套设计做进正式应用，并加一个持久化的风格切换器：
- 甲 太极星盘 `taiji`（默认）
- 乙 阴阳昼夜 `yinyang`
- 丙 浑天仪 `armillary`

罗盘要放大，轨道要更多（具体数值见设计稿）。目前还没有改动任何正式文件。

## 硬性约束
- 不要清空、也不要写入真实的 `data/kongwo-data.json`。
- 真实实例跑在 18765 端口，不要碰。
- 测试只用 28765 端口：`python server.py --port 28765 --data C:/Users/Kant/AppData/Local/Temp/kw-test`，预览配置名是 `kongwo-test`。
- 服务器只监听 localhost。
- 不用 PowerShell 的 ExecutionPolicy Bypass。
- WorkBuddy 的 key 保持脱敏。
- 不照搬 v4 的背景，UI 上不出现“三板斧”字样。
- 大的新产品功能先和用户商量。
- 收尾时把 `.claude/launch.json` 里的 `kongwo-test` 删掉，只保留 `kongwo`。
- 最后用中文简短汇报。

## 加载顺序 / 缓存
- CSS 加载顺序：style → interactions → asset-theme → polish → cards → orbit
- JS 加载顺序：local-store → framework-seed → app → cards → orbit
- `index.html` 里所有 `?v=20261016c`（第 2 行和第 30 行）都改成 `?v=20261017a`。
- 在 head 里加一段 compass 脚本，照第 1 行的 paper 脚本写：
  - 读取 `?compass=` 参数或 localStorage `kongwo-compass`
  - 设置 `html[data-compass]`，默认值 `taiji`
- 可选：把 `kongwo-compass` 同时加进 `local-store.js:6` 的 `KEYS` 和 `server.py:36` 的 `ALLOWED_KEYS`。

## 现有接口（app.js）
- 全局变量和函数：`domains`、`active`、`saveDomains()`、`moveNode(i,to)`、`renderAll()`。
- `moveNode(i,to)`：
  - 每个领域最多 6 个节点
  - 会删掉节点的 a/r
  - 失败时返回假值
- `renderAll()`（app.js:103）：
  - 设置 `#mapCenter` 的文字
  - 重建 `#mapNodes`：每个节点是 `button.map-node.n{i}`，里面有 `<b>`、`<small>`，以及 `.node-ops`（带 `[data-edit]` 和 `[data-del]`）
  - 节点少于 6 个时追加 `.map-add[data-add]`
- 节点坐标：
  - `n.a` 是角度，0 在正上方、顺时针，并且是相对于运动相位的值
  - `n.r` 是占地图边长的比例（VIEW=435）
- 真实数据里已经有 a/r，新的映射必须兼容旧值：按 r 归到最近的轨道。

## 现有 orbit.js（193 行，需重写）和 orbit.css（74 行，需扩展）
下面这些行为全部要保留：
- 拖拽
  - 5px 阈值和 pointer capture
  - 拖动时节点和地图都加 `is-dragging`
  - 吸附到轨道，显示 `i.orbit-trace` 和 `.on-ring`
  - 松手保存
- 拖到左侧领域
  - 用 `elementFromPoint` 找到 `.domain`
  - 加 `is-drop` / `is-leaving` 状态
  - 调用 `moveNode`
- 点击和拖拽的区分：在捕获阶段用 `justDragged` 拦掉拖拽后的点击。
- 键盘：Shift+方向键，角度 ±5°，半径 ±4/VIEW。
- 暂停与减速
  - `prefers-reduced-motion` 时冻结
  - `#cardLayer.is-open` 时暂停
  - 鼠标悬停时平滑减速到停止
- 相位存 localStorage `kongwo-orbit`，每 10 秒和 pagehide 时保存。
- `.map-add` 放在最大的空隙里（`gapAngle`）。
- 节点装饰
  - 加 `orb` 类和 `--spin/--tex/--moon` 变量
  - 字号自适应
  - title 提示文字
- 包装 `renderAll`，让它每次重渲染后调用 `decorate()`。

## 计划架构
- 引擎与插件：一个共享引擎，加三个风格插件。
- SVG 画布
  - 在 `#lifeMap` 里、`#mapNodes` 之前插入 `<svg class="compass-art" viewBox="-262 -262 524 524" aria-hidden="true">`，设 pointer-events:none。
  - 切换风格时重建这个 SVG。
  - 节点半径比例 = R/524。
- 旧装饰：在 `html[data-compass]` 下隐藏 `.instrument-lines`、`.map-center`、`.dir` 和 `.life-map:before`。
- 中心标签：每次 renderAll 之后，把 `domains[active].name` 写进 SVG 中心的文字。
- 运动模型
  - 每条轨道的偏移 = 方向 × 时间 × 360 / 周期
  - 存储的 `a` 是相对于所在轨道偏移的角度
  - 松手时吸附到最近的轨道，存 `a = 指针角度 − 偏移`
- 丙 浑天仪的拖拽
  - 先把指针坐标按轨道倾角反向旋转
  - θ = atan2(y/ry, x/rx)
  - 景深：depth = sinθ，scale = .74 + .26·(d+1)/2，opacity = .5 + .5·(d+1)/2，同时调整 z-index
- 乙 阴阳昼夜的夜色：当 ((a − t·4) mod 360) < 180 时，给节点加夜色 class 或 CSS 变量。
- 切换器
  - 罗盘旁边放三个按钮：太极星盘 / 阴阳昼夜 / 浑天仪
  - 用 `aria-pressed`，键盘可聚焦
  - 选择存到 localStorage `kongwo-compass`
- 尺寸
  - `.life-map` 改成 `min(560px,92%)`，移动端 `min(400px,96%)`
  - 旧尺寸规则在 `style.css:1,10`
  - 节点尺寸规则：桌面 `polish.css:340`（68px），移动端 `polish.css:462`（54px）

## 设计参数（详见 design/compass-options.html）
颜色：INK #14211f，TEAL #07575a，RED #b64b35，PAPER #f0ebdf。

- 甲 太极星盘
  - 外环 r226 和 r212
  - 72 个刻度
  - 24 节气文字，放在 r203
  - 轨道 r112、150、188，周期分别 50、85、130 秒
  - 八卦在 r79–98，以 −2.5°/s 旋转
  - 中心太极 r62，以 6°/s 旋转
  - 节点后面拖尾迹
- 乙 阴阳昼夜
  - 底层是 r226 的大太极水墨晕染，以 4°/s 旋转
  - 轨道 r96、130、164、198，奇数轨道反向转
  - 周期 60、80、105、135 秒
  - 中心是 r58 的青色太阳
- 丙 浑天仪
  - 三个椭圆轨道：rx118/ry44 倾角 −20°，rx162/ry60 倾角 15°，rx204/ry78 倾角 −5°
  - 椭圆后半段画虚线
  - 一条子午圈
  - 中心是 r56 的球形太极，以 7°/s 旋转
  - 周期 45、70、100 秒
