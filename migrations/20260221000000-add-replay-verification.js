export async function up(queryInterface, Sequelize) {
  await queryInterface.createTable("ReplayVerifications", {
    runId: {
      type: Sequelize.STRING,
      primaryKey: true,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    message: {
      type: Sequelize.TEXT,
      allowNull: true,
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
}

export async function down(queryInterface) {
  await queryInterface.dropTable("ReplayVerifications")
}
