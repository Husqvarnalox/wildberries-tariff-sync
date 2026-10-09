import { z } from "zod";

// The API returns numeric values as strings (possibly with decimal commas or "-"), but be lenient about numbers too.
const looseValue = z.union([z.string(), z.number()]).nullish();

export const wbWarehouseTariffSchema = z.object({
    warehouseName: z.string().nullish(),
    geoName: z.string().nullish(),
    boxDeliveryBase: looseValue,
    boxDeliveryLiter: looseValue,
    boxStorageBase: looseValue,
    boxStorageLiter: looseValue,
    boxDeliveryCoefExpr: looseValue,
    boxStorageCoefExpr: looseValue,
});

export const wbTariffsResponseSchema = z.object({
    response: z.object({
        data: z.object({
            dtNextBox: z.string().nullish(),
            dtTillMax: z.string().nullish(),
            warehouseList: z.array(wbWarehouseTariffSchema),
        }),
    }),
});

export type WbWarehouseTariff = z.infer<typeof wbWarehouseTariffSchema>;
export type WbTariffsResponse = z.infer<typeof wbTariffsResponseSchema>;
