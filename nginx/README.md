# CITIMART Daily Operations — Nginx L7 Gateway

![Nginx](https://img.shields.io/badge/Nginx-1.25+-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Reverse%20Proxy-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Security](https://img.shields.io/badge/Security-L7%20Hardened-green?style=for-the-badge&logo=shield&logoColor=white)

> **High-Performance L7 API Gateway, Reverse Proxy & Load Balancer**  
> Routes incoming store manager and executive traffic between the built React SPA frontend and dynamically scaled FastAPI backend replicas.

---

## 📑 Table of Contents
1. [Architecture & Gateway Topology](#-architecture--gateway-topology)
2. [Key Capabilities](#-key-capabilities)
3. [Upstream Routing & Load Balancing](#-upstream-routing--load-balancing)
4. [Edge Abuse Shielding & Rate Limiting](#-edge-abuse-shielding--rate-limiting)
5. [Micro-Caching Strategy](#-micro-caching-strategy)
6. [Security Headers & Hardening](#-security-headers--hardening)
7. [SSL/TLS Termination](#-ssltls-termination)
8. [Configuration Verification & Operations](#-configuration-verification--operations)

---

## 🏗️ Architecture & Gateway Topology

Nginx acts as the single entry point for all traffic arriving at `Daily Operations` on ports `:80` (HTTP) and `:443` (HTTPS):

```
                       [ Incoming Public Traffic (Ports 80 / 443) ]
                                            │
                                            ▼
                                  [ Nginx L7 Gateway ]
                          (Edge Rate Limit & Security Headers)
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     │                                             │
               Path: `/api/*`                                Path: `/*`
                     │                                             │
                     ▼                                             ▼
       [ Upstream `citimart_backend` ]                  [ Static SPA Server ]
     (Least-Connections Load Balanced)               (Mounted `frontend/dist/`)
                     │                                             │
        ┌────────────┼────────────┐                                ▼
        ▼            ▼            ▼                        [ index.html ]
   [ Backend 1 ] [ Backend 2 ] [ Backend 3 ]           (Client-Side Routing)
```

---

## 🌟 Key Capabilities

* **Dynamic DNS Resolution:** Utilizes Docker's internal DNS (`127.0.0.11 valid=10s`) so `docker compose up --scale backend=N` dynamically registers new backend containers without requiring an Nginx reload.
* **Least-Connections Routing:** Automatically routes each incoming API request to the backend replica with the lowest active connection count.
* **Static Asset Serving:** Delivers compiled Vite bundle assets (`.js`, `.css`, `.svg`, `.woff2`) with aggressive caching and `try_files` fallback for SPA HTML5 client-side navigation.
* **Edge Abuse Protection:** Blocks Layer 7 denial-of-service and brute-force bursts before requests touch the Python application processes.

---

## ⚖️ Upstream Routing & Load Balancing

Defined in `nginx.conf`:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;

upstream citimart_backend {
    least_conn;
    zone citimart_backend 64k;
    server backend:8000 resolve max_fails=3 fail_timeout=10s;
    keepalive 128;
}
```

* `least_conn`: Distributes requests to the least busy backend container.
* `resolve`: Continually queries Docker DNS to discover added or removed replicas.
* `keepalive 128`: Maintains persistent TCP connections to upstream backends to eliminate connection handshake latency.

---

## 🛡️ Edge Abuse Shielding & Rate Limiting

Protects backend workers from network floods while accommodating legitimate store networks operating behind a shared NAT:

```nginx
# 200 requests/sec ceiling for general API traffic
limit_req_zone $binary_remote_addr zone=api_zone:20m rate=200r/s;

# 100 requests/sec ceiling for login/auth routes
limit_req_zone $binary_remote_addr zone=login_zone:10m rate=100r/s;

limit_req_status 429;
```

---

## ⚡ Micro-Caching Strategy

* **Authenticated Routes (`/api/*`):** Micro-caching is **strictly disabled** for all authenticated endpoints to prevent cross-tenant telemetry leaks. Every authenticated request is forwarded directly to the backend.
* **Health Probes (`/api/health`):** Micro-cached for up to 5 seconds to absorb high-frequency Kubernetes or Docker health monitoring checks without overloading the database.

---

## 🔒 Security Headers & Hardening

Every HTTP response emitted by the gateway includes modern defense headers:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "1; mode=block" always;
server_tokens off;
```

---

## 🔐 SSL/TLS Termination

In production, terminate TLS directly at Nginx:

1. Place your valid certificates in `nginx/certs/`:
   - `citimart.crt`
   - `citimart.key`
2. Uncomment the SSL block in `nginx.conf`:
   ```nginx
   listen 443 ssl http2;
   ssl_certificate /etc/nginx/certs/citimart.crt;
   ssl_certificate_key /etc/nginx/certs/citimart.key;
   ssl_protocols TLSv1.2 TLSv1.3;
   ssl_ciphers HIGH:!aNULL:!MD5;
   ```
3. Enable HTTP $\to$ HTTPS automatic redirection.

---

## 🧪 Configuration Verification & Operations

```powershell
# Validate syntax of nginx.conf
docker compose exec nginx nginx -t

# Reload configuration gracefully with zero dropped connections
docker compose exec nginx nginx -s reload

# Check access and error logs
docker compose logs -f nginx
```
