import SwiftUI

struct ContentView: View {
    @Environment(\.openURL) private var openURL

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {

                    header

                    stepCard(
                        number: "1",
                        title: "打开 Safari 扩展",
                        detail: "设置 → Safari → 扩展 → 划词翻译，打开开关，再点进去允许访问所有网站。"
                    )
                    stepCard(
                        number: "2",
                        title: "划过一段外文",
                        detail: "任意网页选中文字，等待约 0.2 秒，会出现蓝色的「译」气泡。"
                    )
                    stepCard(
                        number: "3",
                        title: "点一下就看译文",
                        detail: "外文译成简体中文，中文译成英文。卡片上可以复制或重试。"
                    )

                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            openURL(url)
                        }
                    } label: {
                        HStack {
                            Image(systemName: "gear")
                            Text("打开系统设置")
                            Spacer()
                            Image(systemName: "chevron.right").font(.footnote)
                        }
                        .padding()
                        .background(Color(red: 0.0, green: 0.63, blue: 0.84).opacity(0.12))
                        .foregroundStyle(Color(red: 0.0, green: 0.63, blue: 0.84))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    tips

                    Spacer(minLength: 8)

                    Text("版本 \(appVersion)")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .padding(20)
            }
            .navigationTitle("划词翻译")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.09, green: 0.75, blue: 0.94),
                                    Color(red: 0.0, green: 0.53, blue: 0.70)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .frame(width: 56, height: 56)
                    Image(systemName: "character.book.closed.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("B站划词翻译")
                        .font(.title2.bold())
                    Text("选中即译 · 免密钥")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func stepCard(number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(.footnote.bold())
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Color(red: 0.0, green: 0.63, blue: 0.84))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var tips: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("小提示")
                .font(.headline)
            tipRow(icon: "keyboard", text: "外接键盘可以按 Alt+T 直接翻译选中内容。")
            tipRow(icon: "bolt.slash", text: "同样的内容第二次选中会走缓存，不发请求。")
            tipRow(icon: "exclamationmark.triangle", text: "如果一直报 412，说明网关拦了跨域来源，需要在扩展里配置中转地址。")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(width: 18)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    ContentView()
}
