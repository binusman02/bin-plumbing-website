export interface NavItem {
  name: string;
  href: string;
  badge?: string;
}

export const COMPANY = {
  name: "FlowGuard Plumbing Enterprises",
  shortName: "FlowGuard Plumbing",
  tagline: "Reliable Plumbing Services, Coordinated with Care",
  heroHeadline: "Reliable Plumbing Services, Coordinated with Care.",
  heroSubheadline:
    "Tell us what you need. Our team reviews your request and helps coordinate an experienced plumbing professional for the job.",
  navigation: [
    { name: "Home", href: "/" },
    { name: "Services", href: "/services" },
    { name: "Guides", href: "/en/blog" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "About", href: "/about" },
    { name: "Track Request", href: "/tracking" },
    { name: "Contact", href: "/contact" },
  ] as NavItem[],
  footerLinks: [
    { name: "Request a Plumber", href: "/request" },
    { name: "Track Your Request", href: "/tracking" },
    { name: "Plumbing Guides (English)", href: "/en/blog" },
    { name: "Labaran Famfo (Hausa)", href: "/ha/blog" },
    { name: "Kano Service Areas", href: "/areas" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "Join as a Plumber", href: "/join-as-plumber" },
    { name: "Frequently Asked Questions", href: "/faq" },
  ] as NavItem[],
  legalLinks: [
    { name: "Terms & Conditions (Draft)", href: "/terms" },
    { name: "Privacy Policy (Draft)", href: "/privacy" },
    { name: "Frequently Asked Questions", href: "/faq" },
  ] as NavItem[],
};
