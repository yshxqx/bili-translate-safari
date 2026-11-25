import SafariServices
import os.log

/// Safari Web Extension 的原生消息处理器。
///
/// 目前这个扩展的所有网络请求都在 JS 的 background 里发，
/// 这里只留一个最小实现，用于将来需要走 native 能力时（比如读系统代理、存 Key）扩展。
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]

        os_log(.default, "BiliTranslate received message: %{public}@",
               String(describing: message))

        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: ["received": true]
        ]

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
