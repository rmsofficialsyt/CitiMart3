# CITIMART Daily Operations — Database Schema & MongoDB Architecture (DATABASE)

**Database System:** MongoDB Atlas (Cloud Cluster)  
**Database Name:** `citimart`  
**Driver:** PyMongo 4.8+ with client-side connection pooling

---

## 1. Collections & Document Schemas

### 1.1 `users`
Stores account identities and PBKDF2 password hashes.
```json
{
  "_id": ObjectId("..."),
  "username": "CITIMART - NEW MARKET",
  "role": "manager",
  "store_code": "NM",
  "password_hash": "pbkdf2_sha256$600000$salt$hash",
  "created_at": "2026-08-29T10:00:00Z",
  "updated_at": "2026-10-30T09:00:00Z"
}
```
- **Indexes:** `{"username": 1}` (Unique)

### 1.2 `bills`
Timestamped checkout transaction records.
```json
{
  "_id": ObjectId("..."),
  "store": "NM",
  "date": "2026-10-30",
  "time": "14:15",
  "time_slot": "02.00 PM - 04.59 PM",
  "net_amount": 2450.0,
  "bill_quantity": 3,
  "created_at": "2026-10-30T14:15:22Z"
}
```
- **Indexes:** `{"store": 1, "date": 1}`, `{"date": 1}`

### 1.3 `footfall` & `nob`
Hourly visitor headcount and buyer counts.
```json
{
  "_id": ObjectId("..."),
  "store": "NM",
  "date": "2026-10-30",
  "time": "14:00",
  "time_slot": "02.00 PM - 04.59 PM",
  "count": 48
}
```

### 1.4 `targets`
Store daily sales revenue milestones.
```json
{
  "_id": ObjectId("..."),
  "store": "NM",
  "date": "2026-10-30",
  "sales_target": 350000.0,
  "prev_year_net_sales": 312000.0,
  "remarks": "Festive weekend target"
}
```
- **Indexes:** `{"store": 1, "date": 1}` (Unique)

### 1.5 `requisitions`
Inventory shortfall orders from floor managers.
```json
{
  "_id": ObjectId("..."),
  "store": "NM",
  "department": "Menswear Formal",
  "item_name": "White Linen Shirt (Size 40)",
  "quantity": 25,
  "status": "Pending Approval",
  "requested_by": "CITIMART - NEW MARKET",
  "created_at": "2026-10-30T11:20:00Z"
}
```

### 1.6 `directives`
Executive directives broadcasted by Raphael Sir.
```json
{
  "_id": ObjectId("..."),
  "title": "Evening Surge Fitting Room Staffing",
  "message": "Deploy 2 additional floor assistants to ladies fitting rooms from 5 PM to 8 PM.",
  "priority": "High",
  "target_stores": ["NM", "HB", "CHW"],
  "created_by": "ADMINISTRATOR",
  "created_at": "2026-10-30T10:00:00Z"
}
```
