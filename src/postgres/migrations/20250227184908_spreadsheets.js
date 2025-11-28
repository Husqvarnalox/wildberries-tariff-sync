export async function up(knex) {
    return knex.schema.createTable("spreadsheets", (table) => {
        table.string("spreadsheet_id").primary();
    });
}

export async function down(knex) {
    return knex.schema.dropTable("spreadsheets");
}
