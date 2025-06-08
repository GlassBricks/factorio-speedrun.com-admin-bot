export async function up(queryInterface, Sequelize) {
  // First, we need to drop the existing primary key constraint
  // and recreate the table with the new composite primary key
  await queryInterface.sequelize.transaction(async (transaction) => {
    // Create a temporary table with the new structure
    await queryInterface.createTable(
      "MessageReports_temp",
      {
        messageId: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        reporterId: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        authorId: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        messageUrl: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        reason: {
          type: Sequelize.STRING,
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
      },
      { transaction },
    )

    // Copy data from the original table to the temporary table
    await queryInterface.sequelize.query(
      `INSERT INTO MessageReports_temp (messageId, reporterId, authorId, messageUrl, reason, createdAt, updatedAt)
       SELECT messageId, reporterId, authorId, messageUrl, reason, createdAt, updatedAt
       FROM MessageReports`,
      { transaction },
    )

    // Drop the original table
    await queryInterface.dropTable("MessageReports", { transaction })

    // Rename the temporary table to the original name
    await queryInterface.renameTable("MessageReports_temp", "MessageReports", { transaction })

    // Add indexes
    await queryInterface.addIndex("MessageReports", ["messageId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["reporterId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["authorId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["createdAt"], { transaction })
  })
}

export async function down(queryInterface, Sequelize) {
  // Revert the primary key change by recreating the table with the original structure
  await queryInterface.sequelize.transaction(async (transaction) => {
    // Create a temporary table with the original structure
    await queryInterface.createTable(
      "MessageReports_temp",
      {
        messageId: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        reporterId: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        authorId: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        messageUrl: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        reason: {
          type: Sequelize.STRING,
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
      },
      { transaction },
    )

    // Copy data from the current table to the temporary table
    await queryInterface.sequelize.query(
      `INSERT INTO MessageReports_temp (messageId, reporterId, authorId, messageUrl, reason, createdAt, updatedAt)
       SELECT messageId, reporterId, authorId, messageUrl, reason, createdAt, updatedAt
       FROM MessageReports`,
      { transaction },
    )

    // Drop the current table
    await queryInterface.dropTable("MessageReports", { transaction })

    // Rename the temporary table to the original name
    await queryInterface.renameTable("MessageReports_temp", "MessageReports", { transaction })

    // Add indexes
    await queryInterface.addIndex("MessageReports", ["messageId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["reporterId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["authorId"], { transaction })
    await queryInterface.addIndex("MessageReports", ["createdAt"], { transaction })
  })
}
