export async function seed(knex) {
    await knex("spreadsheets")
        .insert([{ spreadsheet_id: "example_spreadsheet_id" }])
        .onConflict(["spreadsheet_id"])
        .ignore();
}
