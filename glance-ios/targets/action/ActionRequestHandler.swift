import UIKit
import UniformTypeIdentifiers

// Action extension skeleton: surfaces the Glance card over the host app.
class ActionViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let label = UILabel()
    label.text = "Glance: draft ready"
    label.textAlignment = .center
    label.numberOfLines = 0
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
    ])
  }
}
