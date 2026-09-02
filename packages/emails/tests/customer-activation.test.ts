import { describe, expect, it } from 'vitest'
import { renderEmail } from '../src/render.js'

describe('customer activation email', () => {
  it('renders the customer invitation in the shared email format', async () => {
    const result = await renderEmail({
      template: 'customer-activation',
      props: {
        userName: 'Priya Shah',
        companyName: 'Acme Instruments',
        activationUrl: 'https://hta-calibration.com/customer/activate/test-token',
      },
    })

    expect(result.subject).toBe('Activate Your HTA Calibration Portal Account')
    expect(result.html).toContain('Priya Shah')
    expect(result.html).toContain('Acme Instruments')
    expect(result.html).toContain('https://hta-calibration.com/customer/activate/test-token')
    expect(result.html).toContain('Activate Your Account')
  })
})
