export async function up(queryInterface, Sequelize) {
  // Drop the SrcPlayer table
  await queryInterface.dropTable("SrcPlayers")

  // Add videoProof column to SrcRuns table
  await queryInterface.addColumn("SrcRuns", "videoProof", {
    type: Sequelize.STRING,
    allowNull: true,
  })
}

/**
 *
 * @param {import("sequelize").QueryInterface} queryInterface
 */
export async function down(queryInterface, Sequelize) {
  // Recreate the SrcPlayer table
  await queryInterface.createTable("SrcPlayers", {
    userId: {
      type: Sequelize.STRING,
      primaryKey: true,
    },
    hasVerifiedRun: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
    },
  })

  // Remove videoProof column
  await queryInterface.removeColumn("SrcRuns", "videoProof")
}
