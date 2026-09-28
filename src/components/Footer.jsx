import React from 'react';
import { Link } from 'react-router-dom';
import { WORDMARK } from '@/components/public/PublicPage';

const platformLinks = [{
  name: 'Solutions',
  path: '/solutions'
}, {
  name: 'Resources',
  path: '/resources'
}, {
  name: 'Documentation',
  path: '/legal/documentation'
}];
const companyLinks = [{
  name: 'About Us',
  path: '/about-us'
}, {
  name: 'Careers',
  path: '/careers'
}, {
  name: 'Contact & Support',
  path: '/legal/support'
}];
const legalLinks = [{
  name: 'Terms of Service',
  path: '/legal/terms-of-service'
}, {
  name: 'Privacy Policy',
  path: '/legal/privacy-policy'
}, {
  name: 'Data Retention & Offboarding',
  path: '/legal/data-retention'
}, {
  name: 'Data Processing Agreement',
  path: '/legal/dpa'
}];
const Footer = () => {
  return <footer data-pl-theme="dark" className="bg-pl-bg border-t border-pl-accent/20 text-pl-muted">
                <div className="mx-auto w-full max-w-[1180px] px-4 py-12 sm:px-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                        <div className="lg:col-span-2">
                            <Link to="/" aria-label="Petrolord Suite home" className="mb-4 flex w-fit items-center rounded-sm">
                                <img className="block h-7 w-auto max-w-full" alt="Petrolord Suite" width="1041" height="108" src={WORDMARK} />
                            </Link>
                            <p className="mb-4">Engineering software for the whole energy asset.</p>
                            <p className="text-sm text-pl-muted max-w-sm">From subsurface to sales on one platform. A Lordsway Energy company.</p>
                        </div>

                        <div>
                            <p className="font-semibold text-pl-accent-text text-xs tracking-[0.14em] uppercase mb-4">Platform</p>
                            <ul className="space-y-2">
                                {platformLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="rounded-sm hover:text-pl-text transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                                <li>
                                    <a href="https://nextgen.petrolord.com" className="rounded-sm hover:text-pl-text transition-colors">
                                        NextGen Academy
                                    </a>
                                </li>
                                <li>
                                    <a href="https://hse.petrolord.com" target="_blank" rel="noopener noreferrer" className="rounded-sm hover:text-pl-text transition-colors">
                                        Petrolord HSE
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-semibold text-pl-accent-text text-xs tracking-[0.14em] uppercase mb-4">Company</p>
                            <ul className="space-y-2">
                                {companyLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="rounded-sm hover:text-pl-text transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                            </ul>
                        </div>

                        <div>
                            <p className="font-semibold text-pl-accent-text text-xs tracking-[0.14em] uppercase mb-4">Legal</p>
                            <ul className="space-y-2">
                                {legalLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="rounded-sm hover:text-pl-text transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-pl-border text-center">
                        <p>&copy; {new Date().getFullYear()} Lordsway Energy. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>;
};
export default Footer;
