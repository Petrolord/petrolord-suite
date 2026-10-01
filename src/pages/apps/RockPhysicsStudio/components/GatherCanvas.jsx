// The gather canvas is shared (src/components/charts/AngleGatherCanvas.jsx)
// since U2-012: Seismolord's synthetics window draws the gather Rock Physics
// publishes with the same code, so the two apps show one picture.
export { default, drawGather, gatherGeometry } from '@/components/charts/AngleGatherCanvas';
