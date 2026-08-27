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
    id: 'geomechanics-studio',
    path: '/dashboard/apps/drilling/geomechanics-studio',
    name: 'Geomechanics & Wellbore Stability Studio',
    hideSidebar: true,
    fullscreen: true
  },
  {
    id: 'basinflow-genesis',
    path: '/dashboard/apps/geoscience/basinflow-genesis',
    name: 'BasinFlow Genesis',
    hideSidebar: true,
    fullscreen: true
  }
  // network-diagram-pro entry removed at Production P0 (app delisted; editor returns inside Production Network Studio at P11)
  // Add more applications here as needed
];

export const getApplicationByPath = (pathname) => {
  return applicationRoutes.find(app => pathname.startsWith(app.path));
};

export default applicationRoutes;