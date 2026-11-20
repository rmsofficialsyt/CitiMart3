# CITIMART Daily Operations — Backend Operational Scripts

> **Administrative CLI Utilities, User Seeding & Password Management**  
> Operational tools for initializing and maintaining store manager and administrator accounts in MongoDB Atlas.

---

## 📂 Available Scripts

### 1. `seed_users.py`
* **Purpose:** Seeds the initial store manager and administrator user accounts into the MongoDB `users` collection.
* **Seeded Accounts:**
  - `admin`: Central Executive Administrator
  - `new_market`: New Market (`NM`) Store Manager
  - `hatibagan`: Hatibagan (`HB`) Store Manager
  - `chowringhee`: Chowringhee (`CHW`) Store Manager
* **Usage:**
  ```powershell
  python seed_users.py
  ```

### 2. `rotate_passwords.py`
* **Purpose:** Rotates passwords for existing accounts using secure Argon2id / PBKDF2 hashing algorithms and updates MongoDB Atlas records.
* **Usage:**
  ```powershell
  python rotate_passwords.py --user new_market --new-password "<secure_password>"
  ```

### 3. `print_credentials.py`
* **Purpose:** Locally verifies existing account usernames, store bindings, and account active statuses without revealing raw plaintext passwords.
* **Usage:**
  ```powershell
  python print_credentials.py
  ```

---

## 🔒 Security Best Practices

> [!CAUTION]
> Never commit plaintext passwords, credentials files (`CREDENTIALS*.txt`, `LOGIN_CREDENTIALS*.txt`), or connection strings to version control. Ensure all outputs remain strictly confidential.
