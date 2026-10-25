import UIKit
import Social

// Share extension skeleton: accepts text/URLs/images from host apps and forwards
// normalized payload to the App Group for the main app's JavaScriptCore classifier.
class ShareViewController: SLComposeServiceViewController {
  override func isContentValid() -> Bool { true }

  override func didSelectPost() {
    let defaults = UserDefaults(suiteName: "group.com.theflowai.glance")
    defaults?.set(contentText, forKey: "glance.share.text")
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  override func configurationItems() -> [Any]! { [] }
}
