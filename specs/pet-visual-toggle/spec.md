# 纯状态气泡模式

## 背景与目标

用户可以在“外观与声音”中关闭桌宠形象，让牛来只保留 Session 状态气泡。关闭后不展示牛来、马来或牛群图片，但 Session、牛记、大盘、设置、文字提醒、窗口移动和全局唤回继续工作。

完成等级为“内部完整”：旧配置无损升级，正常启动和设置往返真实可用，角色资源与控制器确实停用，鼠标穿透边界正确，重新开启能恢复此前的牛/马/牛群选择。

## 当前行为与问题证据

- 单宠图片由 `setCow`、`applyPetMode`、眨眼、说话与环境动作多条路径加载；只用 CSS 隐藏仍会解码图片并运行定时器。
- 牛群由独立控制器挂载到 `cowStage`；只隐藏节点会保留 Actor、拖动和可点击区域。
- `cowStage` 是自定义角色拖动入口，气泡标题栏已经使用 `-webkit-app-region: drag`，可以在纯气泡模式承担窗口移动。
- 鼠标穿透区域来自实际可见元素；正确隐藏 `cowStage` 后可以自然收缩到气泡，但切换时必须立即重算。

## 范围

### 配置

- 配置升级为 v9，新增 `showPetVisuals: boolean`，默认 `true`。
- 旧配置缺少字段时迁移为 `true`；不修改 `petMode`、`herdMode`、当前牛造型或声音设置。

### 设置

- “外观与声音”新增总开关“显示桌宠形象”。
- 文案说明关闭后牛、马和牛群一起隐藏，只保留 Session 状态气泡。
- 牛/马/牛群选择仍可保留和修改，重新显示时按最新选择恢复；桌宠缩放在形象关闭时禁用，气泡缩放与声音设置继续可用。
- 保存后立即切换；取消/关闭设置不改变已保存状态。

### 角色生命周期

- 关闭时：停止单宠动画/说话/彩蛋，清理单宠交互，销毁已挂载牛群视图，隐藏并移出 `cowStage` 的键盘和读屏路径，隐藏 Roll。
- 关闭时不清空 `petMode`、`herdMode` 或牛群运行期皮肤记忆。
- 角色隐藏期间扫描继续，状态列表继续更新；不加载或切换角色图片。
- 角色隐藏期间需要反馈的短文案显示为普通 Toast，不启动嘴型或角色声音。
- 重新开启时：根据保存的 `herdMode` 恢复牛群，否则恢复 `petMode`、当前牛造型、眨眼、环境动作和单宠交互。
- 显式 QA 牛群/切片模式优先展示角色，避免测试入口被用户配置遮蔽。

### 视觉与交互

- `#pet[data-pet-visuals="hidden"]` 进入纯气泡布局，隐藏气泡尾巴，宽度不再受牛马组合影响。
- 气泡展开/收起、牛记、大盘、设置、Session 跳转、全局隐藏/唤回保持不变。
- 交互区域中不再包含不可见 `cowStage`；气泡标题栏可拖动窗口。

## 非目标

- 不分别提供“隐藏牛”“隐藏马”“隐藏牛群”三个开关。
- 不新增无角色时的替代头像、悬浮把手或新通知中心。
- 不改变声音偏好本身；只是角色隐藏期间不播放失去视觉来源的叫声。
- 不改变 README、版本发布物、DMG/ZIP 或签名。

## 状态与调用链

```text
config.showPetVisuals
  -> setPetVisualsVisible
     -> hidden: stop/destroy character lifecycle -> hide cowStage -> sync regions
     -> shown: restore herd or single pet lifecycle -> sync regions

scan / memo / market event
  -> showCaption
     -> visuals shown: cow caption + mouth animation
     -> visuals hidden: ordinary Toast only
```

运行期用 `petVisualsVisible` 表示真实挂载状态；`herdModeActive` 只表示牛群视图已经挂载，不能用保存配置代替。

## 验收标准

1. 旧配置升级后 `showPetVisuals === true`，其他桌宠字段不变。
2. 设置页可保存开关，`showPetVisuals` 被写入配置。
3. 正常单宠关闭后 `cowStage`、Roll、角色字幕和牛群 Actor 均不可见，气泡和设置可用。
4. 关闭期间扫描不触发角色图片准备、眨眼、说话或环境动作；文字反馈使用 Toast。
5. 牛群模式关闭形象后 Actor 被卸载；重新开启后恢复牛群且绑定不变，不降级为单宠。
6. 牛/马/牛马模式关闭再开启后恢复原 `petMode` 与造型。
7. 纯气泡模式可以通过标题栏拖动，透明区域可穿透，交互区域不包含隐藏 `cowStage`。
8. 显式 QA 34 牛模式仍展示 34 头牛，不受保存配置影响。
9. 深浅色、气泡展开/收起、牛记、大盘、设置和 Session 点击无回归。
10. 全部 JavaScript 通过 `node --check`；`npm test`、`npm run pack` 与真实 Electron smoke 通过。

## 风险

- 从隐藏切回牛群时必须按最新扫描重建视图，同时保留运行期皮肤记忆。
- `stopCowPointing` 当前会重新调度眨眼；隐藏流程需要先更新总闸门，再执行清理。
- 设置关闭动作会恢复预览缩放与模式；相关调用必须服从视觉总闸门，不能偷偷加载角色图片。
- QA 验证结束后必须关闭测试实例，再恢复正常配置实例，不能再次把强制牛群留给用户。
