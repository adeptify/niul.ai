# 菜单栏驻留模式

## 背景与目标

牛来当前已经有 macOS 菜单栏牛头、后台扫描和系统通知，但菜单栏只负责显示/隐藏完整桌宠。用户希望把桌宠收进菜单栏后只留下小牛头，有消息时获得提醒，点击牛头展开牛来。

菜单栏展开内容必须与桌面上的 Session 气泡是同一个界面、同一套功能和同一份状态，不能维护一个删减版轻量面板。牛来只改变窗口位置与角色是否出现，不复制 Session、牛记、大盘或设置 UI。

完成等级为“内部完整”：配置升级、重启恢复、单窗口两种壳层往返、通知、失败降级、键盘操作、深浅色、多显示器定位、打包和真实 Electron 运行均需验证。

## 当前行为与问题证据

- `electron/main.js` 已创建 `Tray`，左键调用 `toggleWindow`，完整窗口固定为透明 720×960 桌宠画布。
- `assets/tray-template.svg` 已是适配 macOS 深浅菜单栏的单色牛头源文件，但 Electron `nativeImage.createFromPath()` 在开发路径和打包后的 ASAR 路径中都会把 SVG 读成空图，导致 Tray 有 16px 占位却没有可见牛头。
- 主窗口隐藏后 `scheduleBackgroundScanning` 会继续扫描；Memo 和长时间等待已经使用系统 `Notification`。
- 完整 Renderer 已包含 Session、牛记、大盘、设置、筛选、深浅色和异常状态，复制第二套菜单会产生功能漂移。
- 完整气泡与桌宠目前共同布局在 `#pet` 中；菜单栏模式需要临时隐藏角色、取消可拖动标题栏并把同一个气泡固定在菜单栏牛头下方。

## 保留、替换、忽略

### 保留

- 现有 `renderer/index.html`、`styles.css` 和 `app.js` 中的完整气泡及全部功能。
- Session 扫描、跳转、Token、大盘、Memo、设置、牛群、深浅色和错误降级合同。
- 菜单栏小牛头、后台扫描、`⌘⇧U` 和系统通知。

### 替换

- Tray 左键从“直接显示/隐藏桌宠”改为：菜单栏模式下切换同一个完整气泡；桌面模式下保持召回完整桌宠。
- 单一 `BrowserWindow` 在“桌面壳层”和“菜单栏壳层”之间切换尺寸、位置和角色生命周期。
- “隐藏桌宠”改为“收进菜单栏”；菜单栏壳层中同一入口改为“放回桌面”。

### 忽略

- 不实现独立的 `menu-bar.html/css/js` 轻量 Popover。
- 不维护第二份简化 Session 列表、第二套空状态或第二套菜单功能。

## 用户场景

1. 用户从完整气泡选择“收进菜单栏”，桌宠窗口隐藏，只保留顶部小牛头；重启后继续驻留。
2. 点击小牛头，同一个完整气泡锚定在牛头下方出现；Session、牛记、大盘、设置、筛选和 Token 与桌面模式一致。
3. 点击外部、按 Escape 或完成 Session 跳转后，菜单栏气泡收起但驻留模式不变。
4. 在菜单栏气泡中选择“放回桌面”或按 `⌘⇧U`，窗口恢复进入驻留前的桌面位置与角色形态。
5. Session 进入等待时，小牛头显示单色 attention 标记；隐藏状态下发送一次即时系统通知，点击后打开同一个气泡并高亮对应 Session。
6. Memo 到期继续发送系统通知；点击后打开同一个气泡的牛记面板。

## 范围与关键决策

### 配置与单窗口状态

- 配置升级为 v10，新增 `menuBarMode: boolean`，默认 `false`。
- 只保留一个主 `BrowserWindow` 和一个 Renderer；运行期保存进入菜单栏前的桌面窗口 bounds。
- 进入菜单栏模式时持久化 `true`、记录桌面 bounds、切换 Renderer 壳层并隐藏窗口。
- 展开桌面模式时持久化 `false`、恢复桌面壳层与原 bounds；若旧 bounds 不可见则按现有安全位置恢复。
- 启动时若 `menuBarMode === true`，窗口加载为菜单栏壳层但不自动出现；扫描和通知继续工作。

### 菜单栏壳层

- 菜单栏模式临时隐藏牛、马、牛群、角色字幕和气泡尾巴，但不修改用户保存的 `showPetVisuals`、`petMode`、`herdMode` 或造型。
- 角色生命周期在菜单栏模式停止；返回桌面后按原设置恢复。
- 气泡主体、顶部六个操作、状态汇总、列表、Token、牛记、大盘、设置和所有文案保持同一 DOM 与同一行为。
- Renderer 通过 `data-shell-mode="menu-bar"` 只调整壳层布局：气泡贴近窗口顶部、标题栏不再拖动、透明区域不截获点击。
- 菜单栏壳层不展示桌宠，因此顶部 Roll 控件使用原生 `disabled` 状态，不响应点击、不改变已保存皮肤、也不产生“放回桌面才能看到”的 Toast；回到桌面且当前组合含牛时恢复可用。
- 菜单栏窗口宽度包住现有气泡，窗口高度不超过牛头所在显示器 work area；所有 overlay 必须能在该高度内使用。

### Tray 与定位

- SVG 保留为可编辑源文件；运行时使用从它们确定性导出的透明 RGBA PNG。存在等待 Session 时使用同轮廓的 attention PNG，并增加不依赖颜色的小圆点。
- Tooltip 显示“牛来”或“牛来 · N 个任务等你”；打开气泡不清除，直到 Session 离开等待。
- 菜单栏模式下左键在牛头所在显示器中定位并切换同一个窗口；点击外部自动隐藏。
- 右键保留原生后备菜单：放回桌面/展开牛来、重新扫描、退出。

### 即时通知

- 相邻 snapshot 由纯状态模块跟踪；首次只建立基线。
- 后续进入 `waiting` 或等待原因升级为 `allow/choose` 时产生一次事件。
- 完整桌宠或菜单栏气泡可见时不发送系统通知；二者隐藏且碎嘴开启时发送。
- 即时通知确认显示后抑制同一等待轮次的 5/20 分钟系统提醒；通知失败时保留延迟提醒降级。
- Session 通知点击后打开同一气泡、切到等待筛选并高亮对应行；Memo 通知点击后打开同一气泡的牛记。

## 非目标

- 不新增第二个 BrowserWindow 或第二套 Renderer 菜单。
- 不重新设计现有完整气泡，不修改 Session 扫描与 `focusSession` 合同。
- 不新增登录、自启动、云同步或远程推送。
- 不使用持续弹跳、闪烁或声音制造菜单栏注意力。
- 不改变用户保存的桌宠/牛群/外观偏好。

## 调用链

```text
完整气泡 “收进菜单栏”
  -> IPC enter-menu-bar-mode
  -> save desktop bounds + persist menuBarMode=true
  -> renderer shell=menu-bar (same DOM, pet lifecycle suspended)
  -> hide BrowserWindow

tray click while menuBarMode
  -> resize and position same BrowserWindow below tray bounds
  -> show/focus + request scan

same bubble Session click
  -> existing focusSession
  -> menuBarMode ? hide anchored bubble : keep desktop pet visible

“放回桌面” / ⌘⇧U
  -> persist menuBarMode=false
  -> renderer shell=desktop + restore bounds and pet lifecycle

snapshot
  -> waiting transition tracker
  -> tray ordinary/attention icon + optional Notification
  -> existing renderer scan/render path
```

## 文件与模块边界

- `electron/main.js`：单窗口壳层切换、Tray、通知和 IPC 编排。
- `electron/menu-bar-state.js`：等待事件与 Tray 展示状态纯函数。
- `electron/menu-bar-position.js`：跨屏幕菜单栏定位纯函数。
- `electron/preload.js`：壳层命令和通知高亮订阅。
- `config/runtimes.default.json`、`electron/config.js`：v10 迁移。
- `renderer/index.html`、`renderer/styles.css`、`renderer/app.js`：同一气泡的两种壳层与入口文案。
- `assets/tray-template.svg`、`assets/tray-attention-template.svg`：可编辑矢量源文件。
- `assets/tray-template.png`、`assets/tray-attention-template.png`：Electron Tray 实际加载的透明 RGBA 图标。
- `test/menu-bar-*.test.js`、`test/config.test.js`、`test/visual-layout.test.js`：状态、定位和单 Renderer 合同。

## 验收标准

1. 旧配置升级为 v10 后 `menuBarMode === false`，其他偏好不变。
2. 进入菜单栏模式后主窗口隐藏、状态持久化；重启不主动显示窗口。
3. 只有一个 `BrowserWindow` 和一份 `renderer/index.html`；仓库不存在独立菜单栏 Renderer。
4. Tray 左键在菜单栏模式下打开/关闭同一完整气泡；右键原生菜单可用。
5. 菜单栏气泡中的 Session、Token、牛记、大盘、设置、筛选、深浅色与桌面模式一致。
6. 菜单栏壳层不显示或运行角色，不修改用户桌宠偏好；返回桌面后完整恢复。
7. 点击外部、Escape 和成功 Session 跳转关闭菜单栏气泡但不退出驻留。
8. “放回桌面”和 `⌘⇧U` 恢复此前桌面 bounds 与角色；多显示器位置可见。
9. 普通/等待两种牛头与 Tooltip 同 snapshot 一致，查看气泡不清除 attention。
10. 首次 snapshot 不通知；后续进入等待/升级等待时按可见性与碎嘴偏好通知一次。
11. Session 通知打开并高亮同一气泡的对应行；Memo 通知打开同一气泡的牛记。
12. 菜单栏壳层深浅色、键盘焦点、Reduce Motion、扫描失败和 overlay 高度可用。
13. `node --check`、定向测试、`npm test`、`npm run pack` 与真实 Electron 往返通过。
14. 开发路径和打包后的 ASAR 路径中，Tray PNG 均能被 Electron `nativeImage` 读取为非空图。
15. 菜单栏壳层的 Roll 按钮视觉和语义均为 disabled，点击或程序调用不会换肤/提示；返回桌面后按桌宠组合恢复。

## 验证命令

```bash
node --check electron/main.js electron/menu-bar-state.js electron/menu-bar-position.js renderer/app.js
node --test test/menu-bar-state.test.js test/menu-bar-position.test.js test/config.test.js test/visual-layout.test.js
npm test
npm run pack
npm start
```

## 风险与假设

- 主窗口进入菜单栏模式时会改变 native bounds；必须在进入前保存桌面 bounds，且不能把菜单栏 bounds 覆盖为新的桌面位置。
- Renderer 临时停用角色必须复用现有生命周期总闸门，不能只用 CSS 隐藏后继续解码图片和跑动画。
- `blur` 只在菜单栏模式隐藏窗口，不能改变正常桌宠的常驻行为。
- macOS 菜单栏可能位于不同显示器，定位必须使用 `tray.getBounds()` 对应 Display。
- 系统通知 `show/failed` 是异步事件；只有确认显示后才抑制延迟提醒。

## 实际验收结果（2026-08-24）

- 通过：1–6、7 的 Escape/外点/成功跳转、8 的桌面往返、9、12 的 488×900 深浅色与原生设置链路、13。
- 部分通过：4 的 Tray production 绑定和 blur 防重开已验证，受自动化工具限制，未物理点击 SystemUIServer status item。
- 部分通过：8 的跨屏仅有负坐标/上下菜单栏几何测试，没有物理第二显示器证据。
- 部分通过：10–11 的 Notification production 路径、去重、失败回退和点击 wiring 已覆盖；打包 App 在当前 Mac 上真实触发后，`show` 与 `Notification.getHistory()` 均确认未投递，因此没有通知点击闭环证据。失败后没有误 acknowledge，延迟提醒 fallback 保留。
- Impeccable 最终 verdict：界面、单窗口架构、功能一致性和原生关闭链路 READY；完成等级因 OS 通知未实际投递维持 NEEDS-FIX，需在签名/通知权限有效环境补一次投递与点击验收。
- 后续实机纠正：安装版 `0.1.0` 未包含菜单栏功能；安装 `0.1.6` 后又确认 SVG 在 Electron 中为 `empty: true`，这解释了“Tray 占位存在但牛头不可见”。现已改用透明 RGBA PNG；开发路径、打包 ASAR 和最终安装版路径均由 Electron 验证为 `empty: false`、`36×36`，验收项 14 通过。最终安装版已在 `menuBarMode=true` 下启动驻留。
- 顶部状态 Roll 修正：真实安装版菜单栏壳层的无障碍树显示 `按钮 (disabled) 回到桌面后可换牛`，桌宠仍不运行；事件处理和 `rollCow()` 均有禁用/短路保护，不再产生换肤或 Toast。验收项 15 通过。

最终证据：`node --check` 通过，`npm test` 193/193，`npm run pack` 通过；真实 Electron 验证菜单栏/桌面往返、Escape、外点、Session 成功跳转、原生目录选择器与重启驻留。
