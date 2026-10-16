import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="noise" style={{ padding: '40px 20px', minHeight: '100vh', backgroundColor: '#f9f9f9' }}>
      <div className="shell" style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#666', textDecoration: 'none', marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Privacy Policy</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>Last updated: October 2024</p>
        
        <div style={{ lineHeight: '1.6', color: '#333' }}>
          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>1. Introduction</h2>
          <p>Welcome to Aayerah Pharma. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you about how we look after your personal data when you visit our website.</p>
          
          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>2. Data We Collect & Platform Scope</h2>
          <p>Aayerah operates this website as an informational and promotional pharmaceutical catalogue. We do not process online transactions, online payments, or digital shopping carts. Any personal data collected is limited to:</p>
          <ul style={{ paddingLeft: '24px', marginTop: '8px' }}>
            <li>Inquiry Data: Name, email address, telephone number, and organization name submitted voluntarily via our contact and inquiry forms.</li>
            <li>Administrative Credentials: Encrypted login identifiers and session records strictly for authorized company administrative staff.</li>
            <li>Technical & Browsing Data: IP address, browser type, and anonymous operational cookies used to ensure website availability and security.</li>
          </ul>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>3. How We Use Your Information</h2>
          <p>We use submitted data solely to:</p>
          <ul style={{ paddingLeft: '24px', marginTop: '8px' }}>
            <li>Respond to direct inquiries, catalogue availability questions, and institutional supply requests.</li>
            <li>Maintain security, prevent unauthorized administrative access, and fulfill statutory healthcare records.</li>
            <li>We never sell, rent, or monetize your contact information or browsing data.</li>
          </ul>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>4. Prescription & Offline Health Records</h2>
          <p>Physical prescriptions presented offline at our registered facility are handled in strict compliance with applicable pharmaceutical regulations and confidentiality protocols. No prescriptions are stored or transmitted through public online checkout carts.</p>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>5. Data Security</h2>
          <p>We implement appropriate technical and organizational safeguards to protect any data submitted through our communication forms.</p>
        </div>
      </div>
    </div>
  );
}
