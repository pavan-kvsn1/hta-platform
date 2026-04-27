import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | HTA Calibration',
  description: 'How we collect, use, and protect your data',
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to Home
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">
          Last updated: April 13, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              HTA Calibration (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our calibration certificate management platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Account Information</h3>
                <p className="text-muted-foreground leading-relaxed">
                  When you create an account, we collect your email address, name, and
                  organization details. Passwords are securely hashed and never stored in plain text.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Certificate Data</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We store calibration certificate information including equipment descriptions,
                  calibration dates, measurement data, and associated documentation.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Usage Data</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We automatically collect certain information when you access our platform,
                  including IP addresses, browser type, login timestamps, and pages visited.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li>Provide and maintain calibration certificate services</li>
              <li>Send notifications about certificate status and upcoming due dates</li>
              <li>Authenticate your identity and maintain account security</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Comply with legal obligations and regulatory requirements</li>
              <li>Improve our platform based on usage patterns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">4. Data Retention</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Data Type</th>
                    <th className="text-left py-2 font-medium">Retention Period</th>
                    <th className="text-left py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2">Account data</td>
                    <td className="py-2">Until deletion requested</td>
                    <td className="py-2">Service provision</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Calibration certificates</td>
                    <td className="py-2">7 years</td>
                    <td className="py-2">Regulatory requirement</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Audit logs</td>
                    <td className="py-2">1 year</td>
                    <td className="py-2">Security compliance</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">Session data</td>
                    <td className="py-2">30 days</td>
                    <td className="py-2">Security</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">5. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
              <li><strong>Erasure:</strong> Request deletion of your personal data</li>
              <li><strong>Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong>Objection:</strong> Object to certain processing activities</li>
              <li><strong>Restriction:</strong> Request limited processing of your data</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise these rights, visit your{' '}
              <Link href="/settings" className="underline hover:text-foreground">
                account settings
              </Link>{' '}
              or contact us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">6. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies only, which are necessary for the platform to function
              properly. These include session cookies for authentication and security tokens.
              We do not use third-party tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">7. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-2">
              <li>Encryption in transit using TLS 1.3</li>
              <li>Encryption at rest for stored data</li>
              <li>Secure password hashing with bcrypt</li>
              <li>Regular security audits and monitoring</li>
              <li>Access controls and authentication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">8. Third-Party Services</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the following third-party services to operate our platform:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 mt-2">
              <li>Google Cloud Platform (infrastructure and hosting)</li>
              <li>Resend (transactional email delivery)</li>
              <li>Sentry (error monitoring)</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              Each provider is bound by data processing agreements and complies with applicable
              privacy regulations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">9. Children&apos;s Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our platform is not intended for use by individuals under the age of 18.
              We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any
              material changes by posting the new policy on this page and updating the
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">11. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy or our data practices,
              please contact us:
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="font-medium">HTA Instrumentation Pvt. Ltd.</p>
              <p className="text-muted-foreground">Email: services@htaipl.com</p>
              <p className="text-muted-foreground">Address: [Company Address]</p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            See also:{' '}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
