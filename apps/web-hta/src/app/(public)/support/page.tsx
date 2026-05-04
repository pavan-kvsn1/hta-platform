import { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Phone, MapPin, Clock, FileText, Download, Shield, Monitor } from 'lucide-react'
import { BackLink } from '@/components/BackLink'

export const metadata: Metadata = {
  title: 'Support | HTA Calibration',
  description: 'Get help with HTA Calibration Management System',
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <BackLink />
        </div>

        <h1 className="text-3xl font-bold mb-2">Support</h1>
        <p className="text-muted-foreground mb-8">
          Need help? We&apos;re here to assist you with your calibration management needs.
        </p>

        <div className="space-y-8">
          {/* Contact Information */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Contact Us</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Email</p>
                  <a
                    href="mailto:services@htaipl.com"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    services@htaipl.com
                  </a>
                  <a
                    href="mailto:prakash@htaipl.com"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    prakash@htaipl.com
                  </a>
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg flex items-start gap-3">
                <Phone className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Phone</p>
                  <a
                    href="tel:+918026617724"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    +91 80 2661 7724
                  </a>
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg flex items-start gap-3">
                <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Business Hours</p>
                  <p className="text-sm text-muted-foreground">Mon - Fri: 9:00 AM - 6:00 PM IST</p>
                  <p className="text-sm text-muted-foreground">Sat: 9:00 AM - 1:30 PM IST</p>
                </div>
              </div>
              <div className="p-4 bg-muted rounded-lg flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Office</p>
                  <p className="text-sm text-muted-foreground">
                    #73, Ramachandra Agrahara, Near T.R. Mills,
                    Chamarajpet, Bangalore - 560 018
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium mb-1">How do I view my calibration certificate?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      If you have a registered account, log in to the{' '}
                      <Link href="/customer/login" className="underline hover:text-foreground">
                        Customer Portal
                      </Link>{' '}
                      to view and download your certificates. If you received a download link via
                      email, click the link to access your certificate directly.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium mb-1">My download link has expired. What do I do?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Download links are valid for 7 days. If your link has expired, please contact
                      us at{' '}
                      <a href="mailto:services@htaipl.com" className="underline hover:text-foreground">
                        services@htaipl.com
                      </a>{' '}
                      with your certificate number and we will issue a new link.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium mb-1">How do I reset my password?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Click &quot;Forgot password&quot; on the login page to receive a password reset
                      email. If you don&apos;t receive it within a few minutes, check your spam folder
                      or contact support.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  <Monitor className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium mb-1">How do I set up the desktop application?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      The desktop app is available for engineers who need offline access to calibration
                      workflows. Contact your administrator to get the installer and registration
                      credentials.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Response Time */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Response Times</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Priority</th>
                    <th className="text-left py-2 font-medium">Description</th>
                    <th className="text-left py-2 font-medium">Response Time</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 font-medium text-red-600">Urgent</td>
                    <td className="py-2">System outage, data loss</td>
                    <td className="py-2">Within 2 hours</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium text-amber-600">High</td>
                    <td className="py-2">Login issues, certificate access problems</td>
                    <td className="py-2">Within 4 hours</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium text-blue-600">Normal</td>
                    <td className="py-2">General inquiries, feature requests</td>
                    <td className="py-2">Within 1 business day</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            See also:{' '}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            {' | '}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
