# Claude娘版 KuroCat：项目说明

这是 [qianyiai/KuroCat](https://github.com/qianyiai/KuroCat) 桌宠的个人改版（非官方）。改动只针对内置形象「大肥鱼 / BigFish」（代码里叫 `dafeiyu`）：把她换色成橙发的 Claude娘，并加了一批新状态和动作。猫的形象和行为保持上游原样。

- 仓库：`floatingdream4/kurocat`（fork）
- 开发分支：`claude-niang-5.1.3`（基于上游 v5.1.3）
- 上游：`qianyiai/KuroCat`

## 改动的基本约定

1. **只改大肥鱼**。新逻辑都用 `catBreed === 'dafeiyu'` 限定，不改猫的行为。这样合并上游更新时冲突最少。
2. **围裙上的图案是仓库主人自己的设计**，所有立绘帧都带着它。任何处理都不要改动、重画或覆盖这块区域。
3. **改完先自查再推送**。用 `tools/render-check` 把所有状态渲染出来看一遍（见下）。
4. **推送即发布**。推到 `main` 或 `claude-niang-*` 分支会自动编译并发版，桌宠会提示更新。所以不要推半成品。
5. Rust 部分在 Linux 环境里无法完整编译（缺 Windows 目标），只能靠对照 `windows-sys` 源码核对签名，实际编译由 GitHub Actions 完成。

## 发布流程

```
改代码 → tools/render-check 自查 → git push → Actions 自动编译 → 发布 Release → 桌宠内点更新
```

- 工作流：`.github/workflows/claude-niang.yml`，只编 Windows x64 的 NSIS 安装包，约 4 分钟。
- 触发：推送到 `main` 或 `claude-niang-*`，且改动涉及 `src/**`、`src-tauri/**`、`index.html`、`menu.html`、`package*.json` 或工作流本身。只改 `tools/`、文档不会触发。
- 版本号：`<主>.<次>.<补丁 × 1000 + 构建序号>`。上游 5.1.3 的第 2 次构建是 `5.1.3002`。CI 在编译前把它写进 `tauri.conf.json` 和 `Cargo.toml`，仓库里这两个文件保持上游的版本号不动。
- 更新器：`src-tauri/src/updater.rs` 查的是本仓库的 Releases（不是上游，也不走上游的镜像）。上游发新版时桌宠不会提示，需要手动把上游合并进来再推。
- 上游自带的 `release.yml`（三平台编译）还在，但日常不用。

## 文件地图

| 文件 | 作用 |
|---|---|
| `src/dafeiyuRenderer.ts` | 大肥鱼的全部画面：立绘切换、活动眼珠、手臂、尾巴、道具、符号、粒子。绝大多数改动在这里 |
| `src/catEngine.ts` | 引擎。负责把输入、闲置时间、拖动、媒体状态等通过 `buildDaFeiYuLayout()` 传给渲染器，以及入睡判定 |
| `src/agentCompanion.ts` | agent 状态事件（working / thinking / waiting / done / error / idle）分发到引擎 |
| `src/main.ts` | 监听后端事件（如 `kuro-media-active`）并转给引擎 |
| `src-tauri/src/media_detect.rs` | 沉浸模式检测：前台窗口是否为全屏的浏览器、播放器或幻灯片放映 |
| `src-tauri/src/updater.rs` | 应用内更新，指向本仓库 |
| `src-tauri/src/mcp.rs` | MCP 工具和 `/hook` 端点，把各家编程工具的钩子事件映射成状态 |
| `src/assets/dafeiyu/` | 立绘和道具 |
| `tools/render-check/` | 渲染自查工具 |
| `tools/sprite-tools/` | 新立绘的对齐与合成脚本 |

## 立绘

全部 224×278、透明底、无手臂无尾巴（手臂和尾巴由代码绘制）。

| 文件 | 用途 |
|---|---|
| `notail_idle.png` | 待机。活动眼珠只在这一帧上绘制 |
| `notail_blink.png` | 眨眼、打瞌睡。由待机帧合成，只换了眼睛 |
| `notail_shy.png` | 害羞（眯眼笑）。由待机帧合成，换了眼、嘴、腮红 |
| `notail_happy2.png` | 开心（张嘴笑）。身体取自待机帧，脸保留自己的下颌 |
| `notail_curious.png` | 好奇、惊讶（星星眼、小圆嘴） |
| `notail_sleep.png` | 睡觉 |
| `notail_watch.png` | 沉浸（戴 3D 眼镜） |
| `notail_angry.png` | 沉浸时被打扰（戴眼镜、鼓脸） |
| `notail_panic.png` | agent 出错（慌张、含泪） |
| `notail_yawn.png` | 打哈欠（闭眼张大嘴，取了下颌） |
| `notail_read.png` | 看书（垂眼微笑） |
| `notail_tea.png` | 下午茶抿一口（闭眼满足） |
| `notail_tsun.png` | 傲娇（眯眼、鼓脸、脸红） |
| `prop_cola.png`、`prop_popcorn.png` | 沉浸时手里的零食 |
| `prop_book.png`、`prop_teacup.png` | 看书、下午茶时手里的书和茶杯 |
| `prop_headset.png` | 耳机，224×278 的叠加层，与立绘对齐，可叠在任何表情上 |

同目录下的四个 `.webp` 是上游遗留的蓝发原版，没有任何代码引用，可以忽略。

### 加新帧的流程

1. 写提示词让出图工具基于 `notail_idle.png` 改表情。用 Gemini 时上传放大 4 倍、铺纯绿底的待机帧（Gemini 输出不了透明底），收图后先抠绿再缩回 224×278。要点：只改脸、不歪头、不画手臂和尾巴、不加任何符号文字、透明底（不行就纯绿底）、围裙图案保持原样。一次只出一张对齐效果最好；批量出图时模型往往会整个重画。
2. 对齐：`python3 tools/sprite-tools/align_frame.py 新图.png src/assets/dafeiyu/notail_idle.png 输出.png`。重合度（IoU）0.95 以上算合格。
3. 如果是不需要改变下巴的表情，再用 `compose_face.py` 以待机帧为底合成，避免切换时下巴和身体跳变。
4. 在 `dafeiyuRenderer.ts` 里：加 `import`，把名字加进 `DaFeiYuExpr`，在 `ensureSprites()` 里注册，在 `renderBody()` 的表情选择链里加条件。
5. 跑 render-check 确认。

## 状态一览

| 状态 | 触发 | 表现 |
|---|---|---|
| 打字 | 按键 | 左右手分工敲键，身体倾斜；打字越快越开心（害羞 → 开心） |
| 尾巴拍键 | 双手都占用时再按键；连续打字后按回车 | 尾巴拍键，带水波纹 |
| 被摸 | 鼠标在她身上来回划 | 开心脸，冒橙色爱心 |
| 隐私模式 | 检测到在输密码 | 闭眼，双手捂眼 |
| 好奇 | agent 状态为 working / thinking | 星星眼，歪头，头旁浮问号，自动敲键盘 |
| 等你确认 | agent 状态为 waiting | 睁眼看着你，右手举起招手，左上方跳动的感叹号 |
| 完成庆祝 | agent 状态为 done | 双臂高举，撒彩纸 |
| 打瞌睡 | 闲置 4 分 15 秒到 5 分钟之间 | 眼睛慢慢闭上、头下垂、惊醒，循环 |
| 睡觉 | 全系统闲置 5 分钟 | 睡觉帧，头垂下，慢呼吸，飘 z。任何输入唤醒 |
| 伸懒腰 | 从睡觉中醒来 | 双手举过头顶，身体拉长 |
| 沉浸 | 前台是全屏的浏览器、播放器或幻灯片 | 戴 3D 眼镜，2 秒后掏出零食并全程拿着，约 30 秒在可乐和爆米花之间交替 |
| 生气 | 沉浸时点她两下或连敲四五个键 | 生气帧 3.4 秒，头抖动，怒气符号，零食暂时收起 |
| 被拖动 | 用鼠标拖着她移动 | 惊讶脸，身体摆动并略微提起，落地时压扁一下 |
| 戳尾巴 | 点尾巴露出的部分 | 尾巴缩回抖动，惊讶脸，眼睛瞥向尾巴 |
| 点赞 | Ctrl+S | 右手举起，弹出大拇指 |
| 被盯着害羞 | 鼠标停在她脸上约 2 秒不动 | 眯眼笑，脸红，头偏开 |
| 打招呼 | 每次启动后约 1 秒；双击她 | 开心脸，右手挥动 2 秒 |
| 贴边探头 | 拖到屏幕左右边缘（上游功能） | 躲到屏幕外露半个身子，手扒着边 |
| 出错慌张 | agent 状态为 error | 慌张脸，双手捂脸颊，身体发抖，冒汗滴，约 6.5 秒；任何新状态立即结束 |
| 打哈欠 | 闲置 20 秒以上时随机出现，白天约 3 分钟一次，23 点到 5 点约 45 秒一次 | 闭眼张嘴，右手抬到嘴边，2.6 秒 |
| 看书 | 闲置 1 分钟以上时随机开始 | 双手捧书，垂眼，头微低。任何输入、打瞌睡开始时收起 |
| 下午茶 | 本地 15:00 到 15:30，且 2.5 秒没打字 | 右手端茶杯，每 9 秒抿一口（闭眼满足脸） |
| 傲娇 | 每次开始摸她的头 1.7 秒 | 别过脸、鼓脸、双手抱胸，不冒爱心；继续摸才变开心 |
| 戴耳机 | 前台是游戏（上游的游戏检测） | 耳机叠加在所有表情上 |

### 表情优先级

从高到低：

隐私模式 > 睡觉 > 沉浸（含生气）> 被拖动 > 傲娇 > 开心或庆祝 > 一次性动作（挥手、点赞、伸懒腰、打哈欠）> 被戳尾巴的惊讶 > 出错慌张 > 等你确认 > 好奇 > 被盯着害羞 > 下午茶抿茶 > 看书 > 打字表情 > 打瞌睡 > 眨眼

耳机不参与优先级，游戏时叠在任何表情上。

其他规则：

- 手在打字时打字优先，一次性动作不抢正在按键的那只手。
- agent 工作或等待期间不打瞌睡、不入睡。
- 沉浸期间不入睡，双击不挥手只算打扰。
- 沉浸检测：进入只需 1 秒内的一次检测命中，退出需要连续 4 秒未命中。点她本人导致焦点切到桌宠窗口时不算退出。

## agent 联动

桌宠不会主动检测 agent，只接收通知。两条通道：

**钩子（自动）**。Claude Code 的 `~/.claude/settings.json` 里给各事件配置命令：

```
C:/Users/<用户名>/AppData/Local/KuroCat/KuroCat.exe --hook --source Claude
```

事件映射：`UserPromptSubmit`、`PreToolUse`、`PostToolUse` → working；`Notification` → waiting；`Stop` → done；`SessionStart`、`SessionEnd` → 待命或清除。

`Notification` 的 matcher 必须限定为 `permission_prompt|agent_needs_input|elicitation_dialog`。留空的话，Claude Code 的空闲提醒也会被当成"等你确认"挂 90 秒，盖住其他状态。

钩子只在本机运行的 Claude Code 里生效（终端 CLI 已验证）。云端会话、聊天和 Cowork 不触发。

**MCP 工具（手动）**。`set_agent_status` 和 `trigger_action`，由接了 KuroCat MCP 的 agent 主动调用。MCP 配置在 Claude 桌面版的 `claude_desktop_config.json` 的 `mcpServers` 里，命令是 `KuroCat.exe --mcp`。

## 渲染自查

```bash
npm ci
tools/render-check/run.sh 输出.png
```

需要本机有 Chrome 或 Chromium。它用模拟时钟逐帧推进渲染器，把 15 个场景画到一张图上：1 到 10 是新增动作，11 到 15 是原有状态的回归检查。加新状态时在 `tools/render-check/main.ts` 的 `scs` 数组里加一个场景。

这个工具只覆盖渲染器，不覆盖引擎里的触发逻辑（闲置计时、媒体检测、钩子映射等），那些仍需在真机上验证。

## 合并上游更新

上游文件是 CRLF 换行，本仓库里改过的文件有些是 LF 或混合换行，直接合并会整文件冲突。用：

```bash
git merge -X ignore-cr-at-eol <上游提交>
```

5.1.2 → 5.1.3 那次合并的冲突点，下次大概率还在这些位置：

- `catEngine.ts`：`buildDaFeiYuLayout()` 的返回字段；入睡判定那一段（要保留"大肥鱼 5 分钟才睡、好奇和沉浸时不睡"的条件）。
- `dafeiyuRenderer.ts`：`DaFeiYuLayout` 接口的字段。
- `main.ts`：`kuro-game-active` 监听器前面的 `kuro-media-active` 监听器。
- 上游改过内部函数名（`wakeRendering` → `wakeAction`），合并后先跑 `npx tsc --noEmit` 找这类问题。
- 上游给大肥鱼新加的绘制代码会带原版的蓝色或深蓝色，要按现有配色改掉。合并后在 `dafeiyuRenderer.ts` 里搜 `#1f223b`、`#272b4b`、`#2957a4` 这类颜色确认。

不要在 GitHub 网页上点 Sync fork 的 "Discard commits"，那会丢掉全部改动。

## 待办

**其他**

- 打字时低头看键盘，活动眼珠显得偏暗，可以调配色。
- 尾巴平时大半藏在头发后面，戳尾巴的可点区域小。
- 朋友安装后菜单里显示的名字仍是「大肥鱼」，因为「Claude娘」这个名字只存在本机配置里，没有写进源码。
- 安卓版和电视端没有做。安卓版的皮肤列表是单独写的，新立绘是否打包未验证。
