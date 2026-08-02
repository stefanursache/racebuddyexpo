/**
 * RaceBuddy - OBD Car Database
 * 
 * Comprehensive database of vehicle manufacturers and models with OBD-II support.
 * Supports all major car brands - no restrictions on connecting to any vehicle.
 * 
 * All vehicles with OBD-II port (1996+ US, 2000+ EU, 2005+ Japan) are supported.
 */

export interface CarBrand {
    id: string;
    name: string;
    region: 'US' | 'EU' | 'JP' | 'CN' | 'Global' | 'Other';
    obdSupport: boolean;
}

export interface CarModel {
    id: string;
    brand: string;
    model: string;
    year: number;
    obdPortLocation: string;
    notes?: string;
}

export const OBD_CAR_BRANDS: CarBrand[] = [
    // Japanese Brands
    { id: 'toyota', name: 'Toyota', region: 'JP', obdSupport: true },
    { id: 'honda', name: 'Honda', region: 'JP', obdSupport: true },
    { id: 'nissan', name: 'Nissan', region: 'JP', obdSupport: true },
    { id: 'mazda', name: 'Mazda', region: 'JP', obdSupport: true },
    { id: 'subaru', name: 'Subaru', region: 'JP', obdSupport: true },
    { id: 'mitsubishi', name: 'Mitsubishi', region: 'JP', obdSupport: true },
    { id: 'daihatsu', name: 'Daihatsu', region: 'JP', obdSupport: true },
    { id: 'suzuki', name: 'Suzuki', region: 'JP', obdSupport: true },
    { id: 'isuzu', name: 'Isuzu', region: 'JP', obdSupport: true },

    // European Brands
    { id: 'volkswagen', name: 'Volkswagen', region: 'EU', obdSupport: true },
    { id: 'audi', name: 'Audi', region: 'EU', obdSupport: true },
    { id: 'bmw', name: 'BMW', region: 'EU', obdSupport: true },
    { id: 'mercedes', name: 'Mercedes-Benz', region: 'EU', obdSupport: true },
    { id: 'porsche', name: 'Porsche', region: 'EU', obdSupport: true },
    { id: 'aston', name: 'Aston Martin', region: 'EU', obdSupport: true },
    { id: 'bugatti', name: 'Bugatti', region: 'EU', obdSupport: true },
    { id: 'fiat', name: 'Fiat', region: 'EU', obdSupport: true },
    { id: 'alfa', name: 'Alfa Romeo', region: 'EU', obdSupport: true },
    { id: 'ferrari', name: 'Ferrari', region: 'EU', obdSupport: true },
    { id: 'lamborghini', name: 'Lamborghini', region: 'EU', obdSupport: true },
    { id: 'maserati', name: 'Maserati', region: 'EU', obdSupport: true },
    { id: 'renault', name: 'Renault', region: 'EU', obdSupport: true },
    { id: 'peugeot', name: 'Peugeot', region: 'EU', obdSupport: true },
    { id: 'citroen', name: 'Citroën', region: 'EU', obdSupport: true },
    { id: 'opel', name: 'Opel', region: 'EU', obdSupport: true },
    { id: 'vauxhall', name: 'Vauxhall', region: 'EU', obdSupport: true },
    { id: 'seat', name: 'Seat', region: 'EU', obdSupport: true },
    { id: 'skoda', name: 'Škoda', region: 'EU', obdSupport: true },
    { id: 'volvo', name: 'Volvo', region: 'EU', obdSupport: true },
    { id: 'saab', name: 'Saab', region: 'EU', obdSupport: true },
    { id: 'rover', name: 'Range Rover', region: 'EU', obdSupport: true },
    { id: 'jaguar', name: 'Jaguar', region: 'EU', obdSupport: true },
    { id: 'bentley', name: 'Bentley', region: 'EU', obdSupport: true },
    { id: 'rolls', name: 'Rolls-Royce', region: 'EU', obdSupport: true },

    // American Brands
    { id: 'ford', name: 'Ford', region: 'US', obdSupport: true },
    { id: 'chevy', name: 'Chevrolet', region: 'US', obdSupport: true },
    { id: 'gmc', name: 'GMC', region: 'US', obdSupport: true },
    { id: 'dodge', name: 'Dodge', region: 'US', obdSupport: true },
    { id: 'ram', name: 'RAM', region: 'US', obdSupport: true },
    { id: 'chrysler', name: 'Chrysler', region: 'US', obdSupport: true },
    { id: 'tesla', name: 'Tesla', region: 'Global', obdSupport: true },
    { id: 'cadillac', name: 'Cadillac', region: 'US', obdSupport: true },
    { id: 'corvette', name: 'Corvette', region: 'US', obdSupport: true },
    { id: 'hummer', name: 'Hummer', region: 'US', obdSupport: true },

    // Chinese Brands
    { id: 'byd', name: 'BYD', region: 'CN', obdSupport: true },
    { id: 'geely', name: 'Geely', region: 'CN', obdSupport: true },
    { id: 'changan', name: 'Changan', region: 'CN', obdSupport: true },
    { id: 'great', name: 'Great Wall', region: 'CN', obdSupport: true },
    { id: 'chery', name: 'Chery', region: 'CN', obdSupport: true },
    { id: 'nio', name: 'NIO', region: 'CN', obdSupport: true },
    { id: 'xpeng', name: 'XPeng', region: 'CN', obdSupport: true },
    { id: 'li', name: 'Li Auto', region: 'CN', obdSupport: true },

    // Korean Brands
    { id: 'hyundai', name: 'Hyundai', region: 'Global', obdSupport: true },
    { id: 'kia', name: 'Kia', region: 'Global', obdSupport: true },
    { id: 'ssangyong', name: 'SsangYong', region: 'Global', obdSupport: true },

    // Indian Brands
    { id: 'tata', name: 'Tata', region: 'Global', obdSupport: true },
    { id: 'mahindra', name: 'Mahindra', region: 'Global', obdSupport: true },
    { id: 'maruti', name: 'Maruti Suzuki', region: 'Global', obdSupport: true },

    // Other Global Brands
    { id: 'polestar', name: 'Polestar', region: 'Global', obdSupport: true },
    { id: 'lotus', name: 'Lotus', region: 'Global', obdSupport: true },
    { id: 'mclaren', name: 'McLaren', region: 'Global', obdSupport: true },
    { id: 'pagani', name: 'Pagani', region: 'Global', obdSupport: true },
    { id: 'koenigsegg', name: 'Koenigsegg', region: 'Global', obdSupport: true },
];

export const OBD_SUPPORTED_MODELS: CarModel[] = [
    // Toyota
    { id: 'toyota-corolla-2015', brand: 'Toyota', model: 'Corolla', year: 2015, obdPortLocation: 'Below steering wheel' },
    { id: 'toyota-camry-2016', brand: 'Toyota', model: 'Camry', year: 2016, obdPortLocation: 'Left of steering column' },
    { id: 'toyota-sequoia-2017', brand: 'Toyota', model: 'Sequoia', year: 2017, obdPortLocation: 'Below steering wheel' },
    { id: 'toyota-4runner-2019', brand: 'Toyota', model: '4Runner', year: 2019, obdPortLocation: 'Below steering wheel' },
    { id: 'honda-nsx-2016', brand: 'Honda', model: 'NSX', year: 2016, obdPortLocation: 'Driver side kick panel' },

    // BMW
    { id: 'bmw-m4-2014', brand: 'BMW', model: 'M4', year: 2014, obdPortLocation: 'Driver side kick panel' },
    { id: 'bmw-m3-2012', brand: 'BMW', model: 'M3', year: 2012, obdPortLocation: 'Driver side kick panel' },
    { id: 'bmw-328i-2015', brand: 'BMW', model: '328i', year: 2015, obdPortLocation: 'Driver side kick panel' },

    // Porsche
    { id: 'porsche-911gt3-2015', brand: 'Porsche', model: '911 GT3', year: 2015, obdPortLocation: 'Left of steering column' },
    { id: 'porsche-cayman-2015', brand: 'Porsche', model: 'Cayman GT4', year: 2015, obdPortLocation: 'Left of steering column' },

    // Ford
    { id: 'ford-mustang-2015', brand: 'Ford', model: 'Mustang', year: 2015, obdPortLocation: 'Below steering wheel' },
    { id: 'ford-focus-2015', brand: 'Ford', model: 'Focus', year: 2015, obdPortLocation: 'Below steering wheel' },

    // Nissan
    { id: 'nissan-gtr-2012', brand: 'Nissan', model: 'GT-R', year: 2012, obdPortLocation: 'Left of steering column' },
    { id: 'nissan-370z-2014', brand: 'Nissan', model: '370Z', year: 2014, obdPortLocation: 'Below steering wheel' },

    // Mazda
    { id: 'mazda-mx5-2015', brand: 'Mazda', model: 'MX-5', year: 2015, obdPortLocation: 'Left of steering column' },
    { id: 'mazda-rx7-2012', brand: 'Mazda', model: 'RX-7', year: 2012, obdPortLocation: 'Below steering wheel' },
];

/**
 * Get all supported car brands.
 */
export function getAllCarBrands(): CarBrand[] {
    return OBD_CAR_BRANDS;
}

/**
 * Get all supported car models.
 */
export function getAllCarModels(): CarModel[] {
    return OBD_SUPPORTED_MODELS;
}

/**
 * Find car brand by ID.
 */
export function findBrand(id: string): CarBrand | undefined {
    return OBD_CAR_BRANDS.find(b => b.id === id);
}

/**
 * Find car models by brand.
 */
export function findModelsByBrand(brandId: string): CarModel[] {
    return OBD_SUPPORTED_MODELS.filter(m => m.brand.toLowerCase() === brandId.toLowerCase());
}

/**
 * Check if a vehicle supports OBD-II.
 * Since OBD-II became mandatory in 1996 (US) and 2000 (EU),
 * all vehicles from those years onward are supported.
 */
export function isOBDSupported(year: number, region: string): boolean {
    const supportedSince: Record<string, number> = {
        'US': 1996,
        'EU': 2000,
        'JP': 2005,
        'Global': 1996,
        'CN': 2008,
        'Other': 1996,
    };

    const threshold = supportedSince[region] || 1996;
    return year >= threshold;
}

export const OBD_CONNECTION_TIPS = [
    '✓ Locate OBD-II port: usually under dashboard, left of steering column, or in kick panel',
    '✓ Common locations: 1) Below steering wheel  2) Driver kick panel  3) Center console',
    '✓ Most cars 1996+ (US), 2000+ (EU), 2005+ (Japan) have OBD-II',
    '✓ Plug adapter into OBD-II port (16-pin connector)',
    '✓ Start vehicle and enable Bluetooth/WiFi on adapter',
    '✓ Pair via RaceBuddy OBD connection screen',
    '✓ Common adapters: ELM327, Veepeak, OBDLink, KonnWei, Carista',
];

export const OBD_FEATURES = [
    { name: 'RPM', pid: '010C', unit: 'rpm', description: 'Engine revolutions per minute' },
    { name: 'Speed', pid: '010D', unit: 'km/h', description: 'Vehicle speed' },
    { name: 'Throttle', pid: '0111', unit: '%', description: 'Throttle pedal position' },
    { name: 'Engine Load', pid: '0104', unit: '%', description: 'Engine load/torque' },
    { name: 'Coolant Temp', pid: '0105', unit: '°C', description: 'Engine coolant temperature' },
    { name: 'Fuel Level', pid: '012F', unit: '%', description: 'Fuel tank level' },
    { name: 'MAF', pid: '0110', unit: 'g/s', description: 'Mass air flow rate' },
    { name: 'O2 Voltage', pid: '0114', unit: 'V', description: 'Oxygen sensor voltage' },
];
