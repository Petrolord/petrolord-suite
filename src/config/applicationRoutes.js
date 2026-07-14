/**
 * Application Routes Configuration
 * Defines which routes are considered "Applications" and their behavior.
 */

export const applicationRoutes = [
  {
    id: 'earth-modeling',
    path: '/dashboard/apps/geoscience/earth-modeling',
    name: 'Earth Modeling',
    icon: 'Mountain',
    description: 'Layer-cake earth modeling on the shared registry',
    hideSidebar: true,
    fullscreen: true
  },
  {
    id: 'mechanical-earth-model',
    path: '/dashboard/apps/geoscience/mechanical-earth-model',
    name: 'Mechanical Earth Model',
    hideSidebar: true,
    fullscreen: true
  },
  {
    id: 'basinflow-genesis',
    path: '/dashboard/apps/geoscience/basinflow-genesis',
    name: 'BasinFlow Genesis',
    hideSidebar: true,
    fullscreen: true
  },
  {
    id: 'network-diagram-pro',
    path: '/dashboard/apps/production/network-diagram-pro',
    name: 'Network Diagram Pro',
    hideSidebar: true,
    fullscreen: true
  }
  // Add more applications here as needed
];

export const getApplicationByPath = (pathname) => {
  return applicationRoutes.find(app => pathname.startsWith(app.path));
};

export default applicationRoutes;