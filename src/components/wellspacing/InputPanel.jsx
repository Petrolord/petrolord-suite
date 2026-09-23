import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, MapPin, ToggleLeft, ToggleRight } from 'lucide-react';
import { formatCoordinates, getExampleCoordinates } from '@/utils/coordinateUtils';
import InteractiveMap from '@/components/wellspacing/InteractiveMap';

const InputPanel = ({ 
  formData, 
  handleInputChange, 
  handleLocationSelect,
  handleCalculate, 
  loading 
}) => {
  const [showDMS, setShowDMS] = React.useState(false);
  const examples = getExampleCoordinates();

  return (
    <div className="lg:col-span-1 space-y-6">
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h2 className="text-2xl font-bold text-white mb-6">Field Characteristics</h2>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fieldName" className="text-white">Field Name *</Label>
            <Input
              id="fieldName"
              name="fieldName"
              type="text"
              value={formData.fieldName}
              onChange={handleInputChange}
              className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
              placeholder="e.g., North Field Block A"
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-white flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Field Coordinates
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDMS(!showDMS)}
                className="text-lime-300 hover:text-lime-200 hover:bg-white/5"
              >
                {showDMS ? <ToggleRight className="w-4 h-4 mr-1" /> : <ToggleLeft className="w-4 h-4 mr-1" />}
                {showDMS ? 'DMS' : 'Decimal'}
              </Button>
            </div>

            <div className="mb-4">
              <InteractiveMap
                latitude={formData.latitude}
                longitude={formData.longitude}
                onLocationSelect={handleLocationSelect}
              />
              <p className="text-xs text-lime-300 mt-2">Click on the map to set coordinates or drag the marker to fine-tune position</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="latitude" className="text-lime-300 text-sm">Latitude</Label>
                <Input
                  id="latitude"
                  name="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={formData.latitude}
                  onChange={handleInputChange}
                  className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                  placeholder={examples.latitude.decimal}
                />
                {showDMS && formData.latitude && (
                  <p className="text-xs text-lime-200">{examples.latitude.dms}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude" className="text-lime-300 text-sm">Longitude</Label>
                <Input
                  id="longitude"
                  name="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={formData.longitude}
                  onChange={handleInputChange}
                  className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                  placeholder={examples.longitude.decimal}
                />
                {showDMS && formData.longitude && (
                  <p className="text-xs text-lime-200">{examples.longitude.dms}</p>
                )}
              </div>
            </div>

            {formData.latitude && formData.longitude && (
              <div className="bg-white/5 rounded-lg p-3 mt-2">
                <p className="text-lime-200 text-sm font-medium">Coordinates:</p>
                <p className="text-white text-sm">{formatCoordinates(formData.latitude, formData.longitude)}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Reservoir Properties</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reservoirArea" className="text-white">Reservoir Area (acres) *</Label>
              <Input
                id="reservoirArea"
                name="reservoirArea"
                type="number"
                step="0.1"
                value={formData.reservoirArea}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 5000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avgNetPayThickness" className="text-white">Avg Net Pay (ft) *</Label>
              <Input
                id="avgNetPayThickness"
                name="avgNetPayThickness"
                type="number"
                step="0.1"
                value={formData.avgNetPayThickness}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 60"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="porosity" className="text-white">Porosity (%) *</Label>
              <Input
                id="porosity"
                name="porosity"
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={formData.porosity}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 15.2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialWaterSaturation" className="text-white">Initial Swi (fraction) *</Label>
              <Input
                id="initialWaterSaturation"
                name="initialWaterSaturation"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.initialWaterSaturation}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 0.25"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reservoirTemperature" className="text-white">Temperature (°F) *</Label>
              <Input
                id="reservoirTemperature"
                name="reservoirTemperature"
                type="number"
                value={formData.reservoirTemperature}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 180"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservoirPressure" className="text-white">Pressure (psi) *</Label>
              <Input
                id="reservoirPressure"
                name="reservoirPressure"
                type="number"
                value={formData.reservoirPressure}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 3500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="recoveryFactor" className="text-white">Recovery Factor (%) *</Label>
              <Input
                id="recoveryFactor"
                name="recoveryFactor"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.recoveryFactor}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 35"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wellPatternType" className="text-white">Well Pattern Type</Label>
              <select
                id="wellPatternType"
                name="wellPatternType"
                value={formData.wellPatternType}
                onChange={handleInputChange}
                className="w-full h-10 px-3 py-2 bg-white/5 border border-white/20 rounded-md text-white focus:ring-2 focus:ring-lime-500 focus:border-lime-500"
              >
                <option value="5-spot">5-spot</option>
                <option value="7-spot">7-spot</option>
                <option value="line-drive">Line Drive</option>
                <option value="uniform-spacing">Uniform Spacing</option>
              </select>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Fluid Properties</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="oilGravity" className="text-white">Oil Gravity (API) *</Label>
              <Input
                id="oilGravity"
                name="oilGravity"
                type="number"
                step="0.1"
                value={formData.oilGravity}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 35"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gasGravity" className="text-white">Gas Gravity (Sg) *</Label>
              <Input
                id="gasGravity"
                name="gasGravity"
                type="number"
                step="0.001"
                value={formData.gasGravity}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 0.75"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initialSolutionGOR" className="text-white">Initial Solution GOR (scf/STB) *</Label>
            <Input
              id="initialSolutionGOR"
              name="initialSolutionGOR"
              type="number"
              value={formData.initialSolutionGOR}
              onChange={handleInputChange}
              className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
              placeholder="e.g., 500"
              required
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Well & Operational Parameters</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wellCost" className="text-white">Well Cost ($/well) *</Label>
              <Input
                id="wellCost"
                name="wellCost"
                type="number"
                value={formData.wellCost}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 5000000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operatingExpense" className="text-white">Opex ($/well/year) *</Label>
              <Input
                id="operatingExpense"
                name="operatingExpense"
                type="number"
                value={formData.operatingExpense}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 200000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minEconomicFlowRate" className="text-white">Min Economic Rate (STB/day) *</Label>
              <Input
                id="minEconomicFlowRate"
                name="minEconomicFlowRate"
                type="number"
                value={formData.minEconomicFlowRate}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="typicalWellDeclineRate" className="text-white">Well Decline Rate (%) *</Label>
              <Input
                id="typicalWellDeclineRate"
                name="typicalWellDeclineRate"
                type="number"
                step="0.1"
                value={formData.typicalWellDeclineRate}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 15"
                required
              />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Economic Parameters</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="oilPrice" className="text-white">Oil Price ($/STB) *</Label>
              <Input
                id="oilPrice"
                name="oilPrice"
                type="number"
                step="0.01"
                value={formData.oilPrice}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 75"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gasPrice" className="text-white">Gas Price ($/Mscf) *</Label>
              <Input
                id="gasPrice"
                name="gasPrice"
                type="number"
                step="0.01"
                value={formData.gasPrice}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 3.5"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="discountRate" className="text-white">Discount Rate (%) *</Label>
              <Input
                id="discountRate"
                name="discountRate"
                type="number"
                step="0.1"
                value={formData.discountRate}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDuration" className="text-white">Project Duration (Years) *</Label>
              <Input
                id="projectDuration"
                name="projectDuration"
                type="number"
                value={formData.projectDuration}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 20"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="royaltiesTaxes" className="text-white">Royalties/Taxes (%) *</Label>
            <Input
              id="royaltiesTaxes"
              name="royaltiesTaxes"
              type="number"
              step="0.1"
              value={formData.royaltiesTaxes}
              onChange={handleInputChange}
              className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
              placeholder="e.g., 25"
              required
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-white mb-4">Well Spacing Range</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minSpacing" className="text-white">Min Spacing (acres/well) *</Label>
              <Input
                id="minSpacing"
                name="minSpacing"
                type="number"
                step="1"
                value={formData.minSpacing}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 20"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSpacing" className="text-white">Max Spacing (acres/well) *</Label>
              <Input
                id="maxSpacing"
                name="maxSpacing"
                type="number"
                step="1"
                value={formData.maxSpacing}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 160"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spacingIncrement" className="text-white">Increment *</Label>
              <Input
                id="spacingIncrement"
                name="spacingIncrement"
                type="number"
                step="1"
                value={formData.spacingIncrement}
                onChange={handleInputChange}
                className="bg-white/5 border-white/20 text-white placeholder:text-lime-300/70"
                placeholder="e.g., 10"
                required
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full mt-6 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-3"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Calculating Optimal Spacing...
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <Calculator className="w-5 h-5 mr-2" />
              Calculate
            </div>
          )}
        </Button>
      </motion.div>
    </div>
  );
};

export default InputPanel;