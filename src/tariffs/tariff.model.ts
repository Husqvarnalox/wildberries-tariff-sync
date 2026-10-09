export interface TariffRow {
    /** UTC calendar date, "YYYY-MM-DD". */
    date: string;
    warehouse_name: string;
    box_delivery_and_storage_expr: string;
    box_delivery_base: number;
    box_delivery_liter: number;
    box_storage_base: number;
    box_storage_liter: number;
    coefficient: number;
}
