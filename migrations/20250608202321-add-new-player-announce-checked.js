export async function up(queryInterface, Sequelize) {
  // Add newPlayerAnnounceChecked column to SrcRuns table
  await queryInterface.addColumn("SrcRuns", "newPlayerAnnounceChecked", {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })

  // Update existing rows to have newPlayerAnnounceChecked = true
  await queryInterface.sequelize.query(
    'UPDATE "SrcRuns" SET "newPlayerAnnounceChecked" = true WHERE "newPlayerAnnounceChecked" IS NULL',
  )
}

/**
 *
 * @param {import("sequelize").QueryInterface} queryInterface
 */
export async function down(queryInterface, Sequelize) {
  // Remove newPlayerAnnounceChecked column
  await queryInterface.removeColumn("SrcRuns", "newPlayerAnnounceChecked")
}
