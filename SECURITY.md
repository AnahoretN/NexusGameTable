# Security Policy

## Supported Versions

Currently, only the latest version of Nexus Game Table is supported.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do not** create a public issue
2. Send an email to: **nikitaanahorettriakin@gmail.com**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

### Response Timeline

- **Initial response**: Within 48 hours
- **Validation**: 3-5 business days
- **Fix release**: Depending on severity

### What to Expect

- You will receive an acknowledgment of your report
- We will verify the vulnerability
- We will work on a fix and coordinate disclosure with you
- You will be credited in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

### For Users

- Only share room IDs with trusted people
- Be cautious when clicking on links from unknown sources
- Keep your browser updated to the latest version
- Use HTTPS when accessing the application in production

### For Developers

```bash
# Run security audits before committing
npm audit

# Check for outdated dependencies
npm outdated

# Update dependencies regularly
npm update
```

## Current Security Posture

### Architecture
- **Type**: Client-side React application with WebRTC peer-to-peer communication
- **Data Storage**: Local browser storage (localStorage)
- **Network**: Direct peer-to-peer connections via PeerJS

### Security Considerations
- No server-side data storage (reduces server attack surface)
- WebRTC encryption built into the protocol
- Local storage data stays on user's device
- Room IDs are the only access control mechanism

### Known Limitations
- Room IDs provide minimal access control
- No authentication system
- No server-side validation
- Local storage is not encrypted

## Dependencies

We regularly update dependencies to patch known vulnerabilities. To check current security status:

```bash
npm audit
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
