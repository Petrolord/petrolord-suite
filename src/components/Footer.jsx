import React from 'react';
import { Link } from 'react-router-dom';

const platformLinks = [{
  name: 'Solutions',
  path: '/solutions'
}, {
  name: 'NextGen Academy',
  path: '/nextgen'
}, {
  name: 'Resources',
  path: '/resources'
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
  name: 'Documentation',
  path: '/legal/documentation'
}];
const Footer = () => {
  return <footer className="bg-slate-900 border-t border-slate-700 text-slate-400">
                <div className="container mx-auto px-6 py-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                        <div className="lg:col-span-2">
                            <Link to="/" className="flex items-center space-x-2 mb-4">
                                <img className="h-10 w-auto" alt="Petrolord - Energy Industry Management" src="https://horizons-cdn.hostinger.com/43fa5c4b-d185-4d6d-9ff4-a1d78861fb87/petrolord-symbol-text-iFUDK.png" />
                            </Link>
                            <p className="mb-4">The Digital Operating System for the Modern Energy Enterprise.</p>
                            <p className="text-sm text-slate-500 max-w-sm">Subsurface intelligence, operational efficiency, and commercial strategy on one unified platform.</p>
                        </div>

                        <div>
                            <p className="font-semibold text-slate-200 tracking-wider uppercase mb-4">Platform</p>
                            <ul className="space-y-2">
                                {platformLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="hover:text-lime-300 transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                                <li>
                                    <a href="https://hse.petrolord.com" target="_blank" rel="noopener noreferrer" className="hover:text-lime-300 transition-colors">
                                        Petrolord HSE
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-semibold text-slate-200 tracking-wider uppercase mb-4">Company</p>
                            <ul className="space-y-2">
                                {companyLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="hover:text-lime-300 transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                            </ul>
                        </div>

                        <div>
                            <p className="font-semibold text-slate-200 tracking-wider uppercase mb-4">Legal</p>
                            <ul className="space-y-2">
                                {legalLinks.map(link => <li key={link.name}>
                                        <Link to={link.path} className="hover:text-lime-300 transition-colors">
                                            {link.name}
                                        </Link>
                                    </li>)}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-12 pt-8 border-t border-slate-700 text-center">
                        <p>&copy; {new Date().getFullYear()} Lordsway Energy. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>;
};
export default Footer;
