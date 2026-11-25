# BiliTranslate — iOS Safari 划词翻译扩展

基于 `index-translate.bilibili.com` 的 Safari Web Extension。
选中网页文字 → 冒出「译」气泡 → 点一下看译文。外文译中文，中文译英文。

## 这是什么

一个 iOS 应用 + Safari 扩展。扩展的 `background.js` 负责所有网络请求
（有 host permission，不走 CORS 预检），`content.js` 负责划词 UI。

## 为什么有这个仓库

构建 iOS 应用需要 Xcode。这个仓库用 GitHub Actions 的 macOS 机器代替本地 Xcode，
产出**未签名 IPA**，再用自己的签名工具安装到设备上。

触发方式：Actions → `build-ipa` → Run workflow，或直接 push 到 main。

产物在 Actions 运行页面的 Artifacts 里：`BiliTranslate-ipa`。

## 目录

```
project.yml              XcodeGen 工程描述（.xcodeproj 由它生成）
App/                     SwiftUI 宿主应用（说明页 + 跳转设置）
Extension/               Safari 扩展原生壳（NSExtensionRequestHandling）
Shared/Resources/        Web Extension 本体
  ├── manifest.json      MV3
  ├── background.js      发请求（绕开 CORS 的关键）
  ├── content.js         划词 UI
  ├── popup.html/js      设置面板
  └── icon-*.png
```

## 编译要点

- 全程 `CODE_SIGNING_ALLOWED=NO`，产出未签名包，由外部工具重签
- `Shared/Resources` 以 **folder reference** 形式嵌入，编译后落在 `.appex/Resources/`
- 宿主 App 与扩展的 `CFBundleVersion` 必须一致，否则安装会失败

## 安装到设备

1. Actions 里下载 `BiliTranslate.ipa`
2. 用签名工具（Esign / GBox / 爱思助手等）重签并安装
3. 首次运行 App，让它注册扩展
4. 设置 → Safari → 扩展 → 划词翻译 → 打开，并允许访问所有网站

## 已知限制

接口网关只放行 bilibili 自家 Origin，任何其它 Origin 会返回 412。
如果扩展里请求失败，需要在设置面板配置一个中转地址（Cloudflare Worker），
把 Origin 改写成站内地址并补上 CORS 头。
