import { Navbar } from '@/components/home/Navbar'
import { HeroSection } from '@/components/home/HeroSection'
import { FeaturesSection } from '@/components/home/FeaturesSection'
import { WorkflowSection } from '@/components/home/WorkflowSection'
import { CTASection } from '@/components/home/CTASection'
import { Footer } from '@/components/home/Footer'

export default function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <CTASection />
      <Footer />
    </>
  )
}
