# opencode-spinner：opencode 干活时的 Clawd 小剧场

**简体中文** · [English](README.en.md) · [给 agent 的安装指引](AGENTS.md)

opencode 2.0 干活时，输入框上方会演一段像素小剧场：Claude 的吉祥物 Clawd 一会儿在工作台前干活，一会儿去板场玩滑板。旁边还有一只 Clawd 宠物，跟着 agent 的动作换姿势、冒气泡。一轮结束放一小段彩带，显示这轮用了多久。

演什么由模型现编：agent 在跑 `bun test` 时，Clawd 可能在板场里来一招 `LINT GRIND +650`，或者在工作台上摆弄一个模型画的道具。随机种子来自电脑正在放的声音，没声音就用系统随机数。

起点是 [hoobnn/hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/spinner) 给 Claude Code 写的 `spinner` mod（MIT），改写成了 opencode 2.0 的 TUI 插件。

![运行中：宠物气泡显示正在跑的命令](assets/opencode-working.svg)

![一轮结束：彩带、用时，宠物报告测试通过](assets/opencode-done.svg)

## 小剧场

一轮被切成一段一段，每段随机是下面两种之一，顺序由这一轮的种子决定，所以每轮都不一样。

**工作台**：Clawd 走着、踩着滑板或抱着包裹进场，找个地方停下来干活，干完离开。干什么从 20 个小场景里挑，跟着 agent 正在做的事走：搜索时拿放大镜、翻书、看望远镜；改文件时敲笔记本、写卷轴、画画、码积木；跑 shell 时打铁、熬魔药、转齿轮、发射火箭；子代理在跑时抛球杂耍、搭积木塔；思考时冒泡泡、亮灯泡、钓鱼、喝咖啡、浇花；等你确认时举着 `?` 牌子。模型画的道具也会混进来。

![工作台的 20 个小场景](assets/clawd.svg)

**板场**：镜头跟着 Clawd 滑过一段随机排布的板场：drop in 台、宝塔（funbox）、平杆、楼梯（有的直接飞过，有的带扶手杆可以磨下去）、跳台和 manual 台。每个障碍随机出一招，名字和分数像滑板游戏一样弹出来，右上角累计这一段的分数：

- 翻板：ollie、kickflip、heelflip、360 flip、varial flip、hardflip、laser flip、double kickflip、pop shove-it；
- 抓板：melon、indy；
- 磨杆：50-50、5-0、boardslide、nosegrind、crooked、smith、feeble，磨的时候冒火花；
- manual、nose manual、drop in；
- 难的招式偶尔会摔（`BAIL!`，扣分）：人趴在地上，板子自己滑走。

模型编的招式会占掉大部分障碍。

![板场里的各种招式](assets/skate.svg)

有权限请求或问题在等你时，不管在演哪段，Clawd 都会回到工作台举牌子。

## 模型现编内容

默认开启。动画还是插件在本地一帧帧画，模型只写内容（JSON），插件严格校验后才用，格式不对或者照抄示例的直接丢掉：

- 板场招式：名字、怎么翻板、多少分，按 agent 正在做的事编（`HANDRAIL REPO GRIND`、`SYNTAX GRAB`）。
- 工作台小场景：一个两帧的像素道具和一句字幕（用你设置的语言）。

**什么时候去找模型**：每轮开始时有一次机会，之后跑工具、思考时最多每 40 秒一次。每次机会先取一个随机种子：某一类内容存得不到 6 条就一定去生成（先补少的那类）；两类都够了，就由种子决定这次去不去（大约 35% 会去）。同一时间只有一个请求，最多等 5 分钟。

**生成时演什么**：生成在后台进行，期间播放已经存下的内容，没有就用自带的随机内容，动画不会停下来等。

**存在哪**：每类保留最近 12 条，存在插件存储里（`~/.local/state/opencode/latest/tui/plugin.opencode-spinner.muse.json`），重启后还在，同时开的几个 opencode 共用。

**用哪个模型**：`cli.json` 的 `model` 选项：

- 不填，或 `session`（默认）：借当前会话的模型（`session.generate`）。不会写进会话历史，但会带上会话上下文，所以内容可能跟你的项目有关，token 也耗得多一些。
- `provider/model-id`，比如 `anthropic/claude-haiku-4-5`：直接调这个模型（`generate.text`），prompt 很短，不带会话上下文。建议选最小最快的。模型 id 可以用 `opencode models` 查。
- `false` 或 `"off"`：关掉，只演自带的随机内容。

opencode 的免费模型（`opencode/…-free`）不让插件直接调用（服务端回 "free tier can only be used from within OpenCode"），遇到这个错误插件会自动改走 `session`。

实测（opencode 2.0.22，免费模型 `opencode/nemotron-3.5-lightning-free`，走 `session`）：一批板场招式大约 40 秒；一批工作台道具要 3 分半左右，而且这个免费模型基本照抄格式示例（会被丢掉）。配了 key 的小模型应该会快得多（我没有 key，没测过）。

## 随机种子：来自声音

在 macOS 上，插件会读系统正在播放的声音的各频段电平（只读电平，不录音、不存盘、不外传），用它们混出一个种子。种子决定这一轮先演什么、板场怎么排、要不要去找模型，也会写进给模型的 prompt（再由种子挑两个灵感词，比如"太空""甜点"），让每批内容都不一样。

没放歌、声音太小、不是 macOS、没装 `swiftc`、或者没给录音权限，都会改用系统随机数（`crypto`），功能照常。

第一次用时插件会用 `src/audio-tap.swift` 编译一个小程序到 `~/.cache/opencode-spinner/`（约 2 秒，需要 macOS 14.2+ 和 `swiftc`，没有的话执行 `xcode-select --install`），macOS 会问一次是否允许终端录制系统音频。不想要可以设 `sound: false`。

## 宠物

- 按思考、调用工具、输出、等待切换姿势。气泡只说 opencode 自己的进度行没有的信息：正在跑的工具（`shell: npm test`、`edit: themes.ts`），或者有权限请求、问题在等你（`❯ 等你确认一下～`）。多个子代理并行时显示数量（`subagent ×3`）。agent 跑测试或提交时，它会说几秒钟（测试通过、测试没过、提交好了）。
- 两轮之间留在原地（完成、被中断、出错，安静 5 分钟后打瞌睡）。每跑完一轮、每次测试通过、每次提交都涨经验升级（`Lv.4`）；点它或输入 `/spinner pet` 摸摸它（`♥12`，冒爱心）。等级和好感度跨会话保存，几个 opencode 养的是同一只。
- 关掉宠物（`companion: false`）后，Clawd 会站到 opencode 自己的进度条前面（`▐▛█▜▌▭▭ ⬝⬝⬝■■ esc interrupt`）。

另外：一轮结束放彩带并显示用时（`▐▛█▜▌ ✻  完成 · 12s`），被中断是难过的脸，出错是一阵故障闪烁；不足 60 列或 20 行时小剧场收起，宠物缩成一行；输入框底栏的 **Spinner** 点一下开关全部动画。

## 安装

需要 **opencode 2.x**（在 2.0.22 上测试过）和支持真彩色的终端（Ghostty、iTerm2、WezTerm、kitty 等）。

全局安装，把仓库克隆进 opencode 的插件目录，然后重启 opencode：

```bash
git clone --depth 1 https://github.com/zcl0621/opencode-spinner ~/.config/opencode/plugins/opencode-spinner
```

只想在某个项目里用，就克隆到项目的 `.opencode/plugins/opencode-spinner`。

要改选项（比如换模型），换一种装法：仓库克隆到任意位置，在 `~/.config/opencode/cli.json` 里写上绝对路径和选项（这时不要再放进插件目录）：

```json
{
  "plugins": [
    { "package": "/Users/you/src/opencode-spinner", "options": { "model": "anthropic/claude-haiku-4-5", "language": "zh-Hans" } }
  ]
}
```

更新：`git -C <克隆的目录> pull`。卸载：删掉那个目录或 `cli.json` 里那一项。

## 命令

只有两个：

- `/spinner status`（或只输入 `/spinner`）：宠物的等级和好感度、用的哪个模型、存了多少招式和小场景、上次的错误、种子现在从哪来。
- `/spinner pet`：摸摸 Clawd。

命令面板（`ctrl+p`）里也有 **Spinner** 和 **Spinner: pet Clawd**。

## 选项

写在 `cli.json` 那一项的 `options` 里，都可以不填：

| 选项 | 作用 | 默认 |
| --- | --- | --- |
| `model` | 现编内容用的模型：`session`、`provider/model-id`，或 `false` 关掉 | `session` |
| `sound` | 用声音出随机种子（macOS） | `true` |
| `visible` | 全部动画的总开关（底栏的 **Spinner** 也能切换，切换结果会保存） | `true` |
| `footerButton` | 输入框底栏的 **Spinner** 开关 | `true` |
| `stage` | 输入框上方的小剧场 | `true` |
| `celebrate` | 一轮结束时的庆祝动画 | `true` |
| `companion` | 宠物 | `true` |
| `reducedMotion` | 只画静止画面，仍随状态变化 | `false` |
| `language` | 文字语言：`auto`、`en`、`zh-Hans`、`zh-Hant`、`ja`、`ko`、`es`、`fr`、`de`、`pt-BR`、`ru` | `auto` |

`language` 为 `auto` 时跟随系统语言环境（`LC_ALL`、`LC_MESSAGES`、`LANG`），都没有时用英语。

## 开发

```bash
bun install
bun run typecheck
bun run test            # = bun test --conditions browser
bun scripts/gallery.ts  # 重新生成 assets/clawd.svg 和 assets/skate.svg
```

- `src/plugin.tsx`：入口，注册界面槽位（`session.composer.top` 放小剧场和宠物，`prompt.footer.status` 放进度行上的 Clawd，`prompt.footer` 放开关）和 `/spinner`。
- `src/spinner.tsx`：订阅 opencode 的事件（`session.execution.*`、`session.tool.*`、`permission.*`、`form.*`），维护每个会话的状态、种子、宠物，以及什么时候去找模型。
- `src/show.ts`：把一轮切成工作台和板场两种片段。`src/clawd.ts`：工作台和 20 个小场景。`src/skate.ts`：板场、招式和计分。
- `src/muse.ts`：给模型的 prompt、对返回内容的校验、要不要去找模型的判断。
- `src/audio.ts`、`src/audio-tap.swift`、`src/tap.ts`：声音种子、读系统音频的小程序、它的编译和启动。
- `src/themes.ts`、`src/scenes.ts`、`src/pets.ts`、`src/cells.ts`：Clawd 的外观和庆祝动画、共用的图层、宠物、字符网格；`src/grid.tsx` 把网格画成 OpenTUI 文本。
- `src/i18n.ts`、`src/lang.ts`：各语言文案。

注意：导入 `solid-js` 的文件必须是 `.tsx`。opencode 只对 `.tsx` 做模块重定向，`.ts` 文件会拿到另一份 Solid，界面就不会刷新。

## 致谢

宠物、工作台的画法和文案的底子来自 [hoobnn](https://github.com/hoobnn) 的 [hoobnn-agent-mods](https://github.com/hoobnn/hoobnn-agent-mods)（MIT）。本仓库同样是 MIT，见 [LICENSE](LICENSE)。
