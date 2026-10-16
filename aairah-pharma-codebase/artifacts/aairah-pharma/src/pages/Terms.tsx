import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function TermsConditions() {
  return (
    <div className="noise" style={{ padding: '40px 20px', minHeight: '100vh', backgroundColor: '#f9f9f9' }}>
      <div className="shell" style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#666', textDecoration: 'none', marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>Terms and Conditions</h1>
        <p style={{ color: '#666', marginBottom: '24px' }}>Last updated: October 2024</p>
        
        <div style={{ lineHeight: '1.6', color: '#333' }}>
          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>1. Agreement to Terms</h2>
          <p>By accessing or using our website and services, you agree to be bound by these Terms and Conditions. If you disagree with any part of the terms, then you may not access our service.</p>
          
          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>2. Use of Service</h2>
          <p>You must be at least 18 years old to use our service. You are responsible for ensuring that all persons who access our website through your internet connection are aware of these Terms of Service.</p>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>3. Medical Information</h2>
          <p>The content provided on Aayerah Pharma is for informational purposes only and is not intended as a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.</p>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>4. Informational Catalogue & Offline Purchases</h2>
          <p>This website serves exclusively as an informational and promotional catalogue for Aayerah Pharmaceuticals. Products, indications, and specifications displayed online do not constitute an online offer of sale, reservation, or ecommerce transaction. Direct purchases, pharmaceutical dispensing, and commercial distributions occur offline at our licensed facility.</p>

          <h2 style={{ fontSize: '24px', marginTop: '32px', marginBottom: '16px' }}>5. Prescription Verification (Rx)</h2>
          <p>In accordance with pharmaceutical regulations, all prescription-scheduled products require verification of an original, valid prescription issued by a licensed medical practitioner prior to physical dispensing at our facility. No prescriptions can be validated or fulfilled automatically online.</p>
        </div>
      </div>
    </div>
  );
}
