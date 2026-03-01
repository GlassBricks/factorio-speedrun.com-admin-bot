export async function up(queryInterface, Sequelize) {
  await queryInterface.addColumn("SrcRuns", "runData", {
    type: Sequelize.JSON,
    allowNull: true,
    defaultValue: null,
  })
  await queryInterface.addColumn("SrcRuns", "videoProofText", {
    type: Sequelize.STRING,
    allowNull: true,
    defaultValue: null,
  })
  await queryInterface.addColumn("SrcRuns", "statusText", {
    type: Sequelize.STRING,
    allowNull: true,
    defaultValue: null,
  })
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("SrcRuns", "runData")
  await queryInterface.removeColumn("SrcRuns", "videoProofText")
  await queryInterface.removeColumn("SrcRuns", "statusText")
}
