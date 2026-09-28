import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateFacilityCapacity, identifyBottlenecks } from '@/utils/fdp/facilitiesCalculations';
import { AlertTriangle } from 'lucide-react';

/**
 * EC6-0. This panel ran against a mock peak of 110,000 bopd, 180 gas and
 * 90,000 bwpd, so every facility was measured against the same invented
 * profile: the example subsea tie-back showed 367 percent utilisation and
 * two bottlenecks whatever the plan said. Gas and water utilisation were
 * literal 60 and 45 percent bars, and the gas capacity was labelled
 * "225,000 MMscfd" against a facility entered at 200.
 *
 * The peak now comes from the plan's own concept and gas-oil ratio, the
 * bars are only drawn for a rate the plan actually carries, and the gas
 * figure carries the unit its own arithmetic produces.
 */
const FacilitiesCapacityAnalysis = ({ facility, peakOilBpd, gorScfPerBbl }) => {
    if (!facility) return <div className="text-pl-muted p-4">Select a facility to view capacity analysis.</div>;

    const capacity = calculateFacilityCapacity(facility);
    const peakGasMscfd = peakOilBpd && gorScfPerBbl ? (peakOilBpd * gorScfPerBbl) / 1000 : null;
    const oilUtilisation = peakOilBpd && capacity.oilCapacity
        ? Math.round((peakOilBpd / capacity.oilCapacity) * 100)
        : null;
    const gasUtilisation = peakGasMscfd && capacity.gasCapacity
        ? Math.round((peakGasMscfd / capacity.gasCapacity) * 100)
        : null;

    const bottlenecks = peakOilBpd
        ? identifyBottlenecks(facility, { oil: peakOilBpd, gas: peakGasMscfd ?? 0, water: 0 })
        : [];

    const Bar = ({ percent, colour }) => (
        <>
            <div className="mt-2 w-full bg-pl-sunken h-1 rounded-full overflow-hidden">
                <div className={`${colour} h-full`} style={{ width: `${Math.min(percent, 100)}%` }} />
            </div>
            <div className="text-xs text-right mt-1 text-pl-muted">{percent}% of capacity</div>
        </>
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-pl-muted uppercase">Oil Capacity</div>
                        <div className="text-2xl font-bold text-pl-text">
                            {capacity.oilCapacity.toLocaleString()} <span className="text-xs text-pl-muted">bpd</span>
                        </div>
                        {oilUtilisation === null
                            ? <div className="text-xs text-pl-muted mt-2">No peak rate on the concept yet</div>
                            : <Bar percent={oilUtilisation} colour="bg-pl-primary" />}
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-pl-muted uppercase">Gas Capacity</div>
                        <div className="text-2xl font-bold text-pl-text">
                            {capacity.gasCapacity.toLocaleString()} <span className="text-xs text-pl-muted">Mscf/d</span>
                        </div>
                        {gasUtilisation === null
                            ? <div className="text-xs text-pl-muted mt-2">No gas-oil ratio on the plan yet</div>
                            : <Bar percent={gasUtilisation} colour="bg-pl-primary" />}
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs text-pl-muted uppercase">Water Handling</div>
                        <div className="text-2xl font-bold text-pl-text">
                            {capacity.waterHandling.toLocaleString()} <span className="text-xs text-pl-muted">bpd</span>
                        </div>
                        <div className="text-xs text-pl-muted mt-2">
                            The plan carries no produced water forecast, so there is nothing to measure
                            this against.
                        </div>
                    </CardContent>
                </Card>
            </div>

            <p className="text-xs text-pl-muted">
                Oil capacity is the nameplate entered on the facility; gas capacity is 1,500 scf per
                barrel of that nameplate. Utilisation is against
                {peakOilBpd
                    ? ` this plan's peak of ${peakOilBpd.toLocaleString()} bopd${peakGasMscfd ? ` and ${Math.round(peakGasMscfd).toLocaleString()} Mscf/d` : ''}.`
                    : ' the plan\'s own peak rate, once a concept carries one.'}
            </p>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-pl-text flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2 text-pl-warning-text" />
                        Identified Bottlenecks (Peak Production)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!peakOilBpd ? (
                        <p className="text-sm text-pl-muted">
                            Enter a peak production rate on a concept to check this facility against it.
                        </p>
                    ) : bottlenecks.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1 text-sm text-pl-text">
                            {bottlenecks.map((b, i) => (
                                <li key={i} className="text-pl-danger-text">{b}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-pl-success-text">No bottleneck at this plan's peak rate.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default FacilitiesCapacityAnalysis;
