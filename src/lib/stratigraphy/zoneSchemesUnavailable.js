// Raised by both zone scheme backends when the organisation table
// (strat_zone_schemes) is absent on the database (AppUpgrade STRAT-U2-008):
// the studio then keeps the schemes in the browser and says why.
export class ZoneSchemesUnavailable extends Error {
  constructor() {
    super('Organisation zone schemes are not available on this database yet: the strat_zone_schemes table has not been created. Schemes stay in this browser until it is.');
    this.name = 'ZoneSchemesUnavailable';
  }
}
