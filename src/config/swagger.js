const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Lunch Box API",
      version: "1.0.0",
      description: "Lunch Box Backend API Documentation",
    },

    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8000}`,
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },

      schemas: {
        UserLoginRequest: {
          type: "object",
          properties: {
            mobileNumber: { type: "string", example: "9876543210" },
            fullName: { type: "string", example: "Shubham" },
            email: { type: "string", example: "test@gmail.com" },
            address: { type: "string", example: "Pune" }
          }
        },

        PartnerRegisterRequest: {
          type: "object",
          properties: {
            kitchenName: { type: "string", example: "Spicy House" },
            ownerName: { type: "string", example: "Rahul" },
            email: { type: "string", example: "rahul@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        },

        PartnerLoginRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "rahul@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        }
      }
    }
  },

  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJSDoc(options);
