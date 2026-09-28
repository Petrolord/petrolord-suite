// Stratigraphy is listed youngest first. Every layer has positive
// thickness: the validators reject a zero-thickness layer.
export const BasinTemplates = [
    {
        id: 'passive_margin',
        name: 'Passive Margin',
        description: 'Classic drift sequence with thermal subsidence. Ideal for Atlantic-type margins characterized by long-term cooling and sediment loading.',
        image: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&q=80&w=300&h=200',
        useCases: ['Atlantic Margins', 'Australian NW Shelf', 'Brazilian Margin'],
        dataRequirements: ['Well logs', 'Checkshot data', 'Regional stratigraphy'],
        defaultStratigraphy: [
            { name: 'Seabed / Recent', thickness: 200, lithology: 'sandstone', ageStart: 5, ageEnd: 0 },
            { name: 'Late Drift', thickness: 1500, lithology: 'shale', ageStart: 50, ageEnd: 5 },
            { name: 'Early Drift (Reservoir)', thickness: 800, lithology: 'sandstone', ageStart: 80, ageEnd: 50 },
            { name: 'Post-Rift Seal', thickness: 400, lithology: 'salt', ageStart: 90, ageEnd: 80 },
            { name: 'Syn-Rift Source', thickness: 600, lithology: 'shale', ageStart: 120, ageEnd: 90, sourceRock: { isSource: true, toc: 4.0, kerogen: 'Type II', hi: 450 } }
            // W7F: a 'Basement' row of zero thickness sat here. Every layer
            // must have positive thickness to pass validation, so the template
            // could never run. Basement is the model's lower boundary, not a
            // deposited layer, and the engine takes it from the heat flow.
        ]
    },
    {
        id: 'foreland',
        name: 'Foreland Basin',
        description: 'Flexural basin formed by thrust loading. Characterized by high sedimentation rates, compression, and rapid burial.',
        image: 'https://images.unsplash.com/photo-1498613630940-73509d291e61?auto=format&fit=crop&q=80&w=300&h=200',
        useCases: ['Rocky Mountains', 'Andean Foreland', 'Appalachian Basin'],
        dataRequirements: ['Thrust timing', 'Erosion estimates', 'BHT data'],
        defaultStratigraphy: [
            { name: 'Molasse Sequence', thickness: 2500, lithology: 'sandstone', ageStart: 20, ageEnd: 0 },
            { name: 'Flysch Sequence', thickness: 1800, lithology: 'shale', ageStart: 40, ageEnd: 20 },
            { name: 'Foredeep Carbonates', thickness: 500, lithology: 'limestone', ageStart: 60, ageEnd: 40 },
            { name: 'Basal Shale (Source)', thickness: 300, lithology: 'shale', ageStart: 80, ageEnd: 60, sourceRock: { isSource: true, toc: 3.5, kerogen: 'Type II', hi: 350 } },
            { name: 'Platform Carbonates', thickness: 1000, lithology: 'limestone', ageStart: 150, ageEnd: 80 }
        ]
    },
    {
        id: 'rift',
        name: 'Continental Rift',
        description: 'Extensional basin with high heat flow and fault-controlled deposition. Often contains lacustrine source rocks.',
        image: 'https://images.unsplash.com/photo-1541629120392-232d4d0448b0?auto=format&fit=crop&q=80&w=300&h=200',
        useCases: ['East African Rift', 'North Sea', 'Rio Grande Rift'],
        dataRequirements: ['Rifting phases', 'Beta factor', 'Heat flow history'],
        defaultStratigraphy: [
            { name: 'Post-Rift Sag', thickness: 1200, lithology: 'sandstone', ageStart: 20, ageEnd: 0 },
            { name: 'Regional Seal', thickness: 500, lithology: 'shale', ageStart: 35, ageEnd: 20 },
            { name: 'Syn-Rift Fill', thickness: 2000, lithology: 'sandstone', ageStart: 55, ageEnd: 35 },
            { name: 'Lacustrine Source', thickness: 400, lithology: 'shale', ageStart: 65, ageEnd: 55, sourceRock: { isSource: true, toc: 5.0, kerogen: 'Type I', hi: 600 } }
            // W7F: the zero-thickness 'Pre-Rift Basement' row was removed for
            // the same reason as in the Passive Margin template.
        ]
    }
];