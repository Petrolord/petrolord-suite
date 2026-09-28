import React from 'react';
    import { Helmet } from 'react-helmet';
    import { PublicPage } from '@/components/public/PublicPage';
    import { Link } from 'react-router-dom';
    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
    import { Button } from '@/components/ui/button';
    import { ArrowLeft, BookText } from 'lucide-react';
    import { appCategories } from '@/data/applications';

    const Documentation = () => {
      const allApps = appCategories.flatMap(category => 
        category.apps.map(app => ({
          ...app,
          category: category.id,
          categoryTitle: category.name
        }))
      );

      const groupedApps = allApps.reduce((acc, app) => {
        const category = app.category || 'Other';
        if (!acc[category]) {
          acc[category] = {
            title: app.categoryTitle,
            apps: []
          };
        }
        acc[category].apps.push(app);
        return acc;
      }, {});

      const categoryOrder = [
        "geoscience",
        "reservoir",
        "drilling",
        "production",
        "facilities",
        "economic-project-management",
      ];

      const sortedCategories = categoryOrder.map(cat => ({
        key: cat,
        ...groupedApps[cat]
      })).filter(c => c.title);


      return (
        <>
          <Helmet>
            <title>Documentation - Petrolord</title>
            <meta name="description" content="Explore the documentation for all applications available on the Petrolord platform." />
          </Helmet>
          <div className="py-10 px-4 sm:px-6 sm:py-12 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <Button asChild variant="outline">
                  <Link to="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </div>
              <Card>
                <CardHeader className="text-center">
                  <CardTitle className="font-pl-display text-4xl font-semibold leading-tight text-pl-text">Documentation Hub</CardTitle>
                  <p className="text-pl-muted mt-2">Your central resource for guides and tutorials.</p>
                </CardHeader>
                <CardContent className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedCategories.map((category) => (
                      <Card key={category.key} className="bg-pl-raised flex flex-col">
                        <CardHeader>
                          <CardTitle className="text-2xl text-pl-text">{category.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow">
                          <ul className="space-y-3">
                            {category.apps.map((app) => (
                              <li key={app.appId}>
                                <Link to={`/dashboard/apps/${app.appId}`} className="flex items-center space-x-3 text-pl-text hover:text-pl-primary-text transition-colors group">
                                  <BookText className="h-5 w-5 text-pl-muted group-hover:text-pl-primary-text" />
                                  <span>{app.name}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      );
    };

// Batch 7C: the page wraps itself in the public frame (light, brand bar).
const DocumentationPage = () => (
  <PublicPage testId="documentation-theme-scope">
    <Documentation />
  </PublicPage>
);

export default DocumentationPage;
