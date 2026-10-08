export async function up(knex) {
    return knex.schema.createTable("wb_tariffs", (table) => {
        table.increments("id").primary();
        table.date("date").notNullable();
        table.string("warehouse_name").notNullable();
        table.string("box_delivery_and_storage_expr").notNullable();
        table.decimal("box_delivery_base", 10, 2).notNullable();
        table.decimal("box_delivery_liter", 10, 2).notNullable();
        table.decimal("box_storage_base", 10, 2).notNullable();
        table.decimal("box_storage_liter", 10, 2).notNullable();
        table.decimal("coefficient", 10, 2).notNullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.timestamp("updated_at").defaultTo(knex.fn.now());

        table.unique(["date", "warehouse_name", "box_delivery_and_storage_expr"]);
        table.index(["date"]);
        table.index(["coefficient"]);
    });
}

export async function down(knex) {
    return knex.schema.dropTable("wb_tariffs");
}
