export interface LocalVinRecord {
    vin: string;
    manufacturer?: string;
    model?: string;
    year?: number;
    plant?: string;
    bodyStyle?: string;
    fuelType?: string;
    trim?: string;
    engine?: string;
    transmission?: string;
}

export const localVinDatabase: LocalVinRecord[] = [
    {
        vin: '1HGCM82633A004352',
        manufacturer: 'Honda',
        model: 'Civic',
        year: 2003,
        plant: 'East Liberty',
        bodyStyle: 'Sedan',
        fuelType: 'Gasoline',
        trim: 'EX',
        engine: '1.7L I4',
        transmission: 'Automatic',
    },
    {
        vin: 'JH4KA8260MC000001',
        manufacturer: 'Acura',
        model: 'Integra',
        year: 2021,
        plant: 'Marysville',
        bodyStyle: 'Coupe',
        fuelType: 'Gasoline',
        trim: 'A-Spec',
        engine: '2.0L Turbo I4',
        transmission: 'Manual',
    },
    {
        vin: 'WVWZZZ1JZ3W123456',
        manufacturer: 'Volkswagen',
        model: 'Golf',
        year: 2003,
        plant: 'Wolfsburg',
        bodyStyle: 'Hatchback',
        fuelType: 'Gasoline',
        trim: 'GTI',
        engine: '2.0L Turbo I4',
        transmission: 'Manual',
    },
];

export function findLocalVinRecord(vin?: string): LocalVinRecord | undefined {
    if (!vin) {
        return undefined;
    }

    const normalized = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    return localVinDatabase.find((record) => record.vin.toUpperCase() === normalized);
}
