import Foundation
import Security
import Darwin

func canonical(_ path: String) throws -> String {
    var buffer = [CChar](repeating: 0, count: Int(PATH_MAX))
    guard realpath(path, &buffer) != nil else { throw NSError(domain: "TestPath", code: 2) }
    return String(cString: buffer)
}

// Narrow stdin/stdout protocol. Never pass secret values in argv or print errors/data.
// Production uses the current user's default login keychain; tests use a separate
// temporary keychain and never query the user's existing items.
struct Request: Decodable {
    let operation: String
    let deviceId: String?
    let keyId: String?
    let value: String?
    let testPath: String?
    let testPassword: String?
}
func checked(_ status: OSStatus) throws {
    if status != errSecSuccess { throw NSError(domain: "Vault", code: Int(status)) }
}
func reply(_ value: String = "") throws {
    let data = try JSONSerialization.data(withJSONObject: ["value": value])
    FileHandle.standardOutput.write(data)
}
do {
    SecKeychainSetUserInteractionAllowed(false)
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard input.count <= 20000 else { throw NSError(domain: "Input", code: 1) }
    let request = try JSONDecoder().decode(Request.self, from: input)
    var keychain: SecKeychain?
    if let path = request.testPath {
        let url = URL(fileURLWithPath: path).resolvingSymlinksInPath()
        let temp = try canonical(FileManager.default.temporaryDirectory.path)
        let base = temp.hasSuffix("/") ? temp : temp + "/"
        guard CommandLine.arguments == [CommandLine.arguments[0], "--isolated-test"],
              (try canonical(url.deletingLastPathComponent().path)).hasPrefix(base), url.deletingLastPathComponent().lastPathComponent.hasPrefix("crm-vault-test-"),
              url.lastPathComponent == "fixture.keychain-db" else { throw NSError(domain: "TestPath", code: 1) }
        if request.operation == "init-test" {
            guard let password = request.testPassword, password.utf8.count >= 32 else { throw NSError(domain: "TestPassword", code: 1) }
            try password.withCString { pointer in
                try checked(SecKeychainCreate(path, UInt32(password.utf8.count), pointer, false, nil, &keychain))
            }
            try reply(); exit(0)
        }
        try checked(SecKeychainOpen(path, &keychain))
        if request.operation == "delete-test" { try checked(SecKeychainDelete(keychain)); try reply(); exit(0) }
        if request.operation == "lock-test" { try checked(SecKeychainLock(keychain)); try reply(); exit(0) }
        if request.operation == "unlock-test" {
            guard let password = request.testPassword else { throw NSError(domain: "TestPassword", code: 1) }
            try password.withCString { pointer in try checked(SecKeychainUnlock(keychain, UInt32(password.utf8.count), pointer, true)) }
            try reply(); exit(0)
        }
    } else {
        guard CommandLine.arguments.count == 1 else { throw NSError(domain: "Arguments", code: 1) }
        try checked(SecKeychainCopyDefault(&keychain))
    }
    guard let device = request.deviceId, UUID(uuidString: device) != nil,
          let key = request.keyId, UUID(uuidString: key) != nil,
          let keychain = keychain else { throw NSError(domain: "Identity", code: 1) }
    let service = "local.social-lead-workbench.device.v2"
    let account = device + ":" + key
    var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                              kSecAttrService as String: service, kSecAttrAccount as String: account]
    if request.operation == "put" {
        guard let value = request.value, let bytes = Data(base64Encoded: value), bytes.count > 0, bytes.count <= 8192 else { throw NSError(domain: "Value", code: 1) }
        query[kSecUseKeychain as String] = keychain
        query[kSecValueData as String] = bytes
        query[kSecAttrLabel as String] = "Social Lead Workbench execution device"
        // File-based login keychain: encrypted by macOS, local (not synchronizable).
        // Do not claim Secure Enclave / physical hardware binding or device-only ACLs.
        try checked(SecItemAdd(query as CFDictionary, nil))
        try reply()
    } else if request.operation == "get" {
        query[kSecMatchSearchList as String] = [keychain]
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        try checked(SecItemCopyMatching(query as CFDictionary, &result))
        guard let bytes = result as? Data, bytes.count <= 8192 else { throw NSError(domain: "Value", code: 1) }
        try reply(bytes.base64EncodedString())
    } else {
        throw NSError(domain: "Operation", code: 1)
    }
} catch {
    // Stable failure code only. No OS description, keychain path or secret in logs.
    FileHandle.standardError.write(Data("DEVICE_VAULT_UNAVAILABLE:\((error as NSError).domain):\((error as NSError).code)\n".utf8))
    exit(1)
}
