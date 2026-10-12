# NotebookLM Plus

为 **Google NotebookLM 网页版**（[notebooklm.google.com](https://notebooklm.google.com/)）增强的 Chrome / Edge 扩展程序（Manifest V3）。
纯 Vanilla JS 开发、无构建步骤，在浏览器中以「加载已解压的扩展程序」方式加载即可直接使用。

## 核心功能

| 功能模块 | 说明 |
|---|---|
| 📝 **出题提示词** | 支持单选、多选、判断题型配置。配合章节范围、题数、难度和语言模板，**一键填入** NotebookLM 自带的出题框。可自动记录章节历史，避免重复出题。 |
| 📕 **错题本与好题本** | 自动收集答错的题目。提供 “错题复习” 和 “好题复习” 功能，支持按题型、掌握状态、加入时间等多维度筛选复习，记录累计作答和正确率。 |
| ⤓ **一键导出** | 支持将回答、笔记、生成物以及网页选中内容一键导出为 **Markdown**，或打印为 PDF。测验卡片提供 `Export` 菜单直接导出含答案版或空白练习卷。 |
| 📓 **多端联动同步** | 支持将错题或复习记录导出到 **Anki**、**Obsidian** 以及 **Notion**，方便进行长期知识管理。 |

设置和模板保存在浏览器同步存储（`chrome.storage.sync`），错题等数据保存在本地存储（`chrome.storage.local`）。启用 AI 出题/批改或 Notion 同步时，相关请求会发送到对应的服务商；API Token 保存在浏览器设置中。

## 安装步骤（开发者模式）

1. 下载或克隆本项目到本地。
2. 打开 Chrome 或 Edge 浏览器，进入扩展程序管理页面：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 在页面右上角开启 **“开发者模式”**（Developer mode）。
4. 点击 **“加载已解压的扩展程序”**（Load unpacked），选择本项目根目录（即包含 `manifest.json` 的目录）。
5. 登录 [Google NotebookLM](https://notebooklm.google.com/) 并进入任意笔记本，页面加载完成后右下角会出现 **NB+** 浮动按钮，点开即可使用。

*注：点击浏览器工具栏中的插件图标可打开配置中心（管理 API Token、出题模板和本地数据清理）。*

## 已知限制与使用注意

- **依赖页面 DOM**：由于 NotebookLM 采用 Angular 单页应用架构且类名动态生成，若官方调整页面结构，可能需要校准选择器（详见下文）。
- **错题判定时机**：错题本仅在页面完全显示正确/错误答案标记后才可触发收集，以确保数据完整。
- **支持浏览器**：当前完美支持 Chrome 和 Microsoft Edge 浏览器。

## 故障排查与选择器校准

如果发现某项功能未生效（例如：答错题未收集、导出没反应等），可能是因为 Google 修改了页面 DOM。您可以通过以下步骤快速排查与校准：

1. 在 NotebookLM 页面按 `F12` 打开开发者工具，查看 Console 控制台，检查是否有 `[NotebookLM Plus] 未能定位「xxx」` 的提示信息。
2. 所有 DOM 选择器都集中在 [`src/content/dom.js`](src/content/dom.js) 的 `SELECTORS` 对象中。
3. 如果需要调试错题检测，可以在控制台运行 `NBLMPlus.quizObserver.debug()` 打印当前状态：
   - *注意：控制台默认上下文为 top 页面，请在控制台左上角将 **JavaScript context** 切换为 **“NotebookLM Plus”**。*
4. 使用 DevTools 元素选择器找到目标元素，并将其特征选择器（优先使用 `aria-label` / `role` / `data-*` 等语义属性）追加到 `dom.js` 中对应 `SELECTORS` 数组的**最前面**。
5. 保存修改后，在 `chrome://extensions/` 页面点击 NotebookLM Plus 插件的 **“刷新”** 按钮即可生效。

## 项目结构

```
manifest.json                     MV3 清单文件
src/common/question-dedup.js      题目归一化、相似度计算与去重过滤
src/common/storage.js             存储层（设置与模板=sync，错题与历史题=local）
src/common/notion-api.js          Notion 同步接口与诊断信息脱敏
src/content/
  dom.js                   ★核心选择器定义表
  md.js                    HTML 转 Markdown 工具
  styles.js                浮动工具栏与 UI 样式定义
  toolbar.js               Shadow DOM 工具栏宿主与界面
  quiz-prompt.js           出题提示词拼装
  quiz-frame.js            测验 iframe 内的错题与好题采集
  quiz-observer.js         错题采集监听器
  quiz-review.js           错题本复习界面与逻辑
  good-review.js           好题本复习界面与逻辑
  export.js                页面及生成物导出
  bootstrap.js             初始化生命周期与事件心跳
src/ui/                    Options 设置页与 Popup 弹窗
```
