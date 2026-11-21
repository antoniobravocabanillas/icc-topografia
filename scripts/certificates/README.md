# Staging database trust anchor

`supabase-prod-ca-2021.crt` is a public CA certificate, not a credential. Downloaded 20 November 2026 over verified HTTPS from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The location comes from Supabase Studio's official `apps/studio/hooks/custom-content/custom-content.json`, key `ssl:certificate_url`, and `SSLConfiguration.tsx` (`prod` environment).

DER SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

The S18 staging operator checks this fingerprint and validity dates, then keeps TLS certificate and hostname verification enabled. It does not install a system trust root, relax TLS validation, or affect application connections. Rotation requires explicit review of the new official certificate.
