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

      /* ================= SECURITY ================= */

      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },

      schemas: {

        /* ================= ADMIN ================= */

        AdminRegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", example: "Super Admin" },
            email: { type: "string", example: "admin@eatepic.com" },
            password: { type: "string", example: "123456" }
          }
        },

        AdminLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "admin@eatepic.com" },
            password: { type: "string", example: "123456" }
          }
        },



        /* ================= DRIVER ================= */

        DriverRegisterRequest: {
          type: "object",
          required: ["fullName", "email", "password", "mobileNumber", "address"],
          properties: {
            fullName: { type: "string", example: "Driver Rahul" },
            email: { type: "string", example: "driver@gmail.com" },
            password: { type: "string", example: "123456" },
            mobileNumber: { type: "string", example: "9876543210" },
            address: { type: "string", example: "Pune" }
          }
        },

        DriverLoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "driver@gmail.com" },
            password: { type: "string", example: "123456" }
          }
        },


        /* ================= PARTNER ================= */

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
        },


        /* ================= CATEGORY ================= */

        CategoryCreateRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "Main Course" },
            description: { type: "string", example: "Lunch items" },
            image: { type: "string", example: "" }
          }
        },


        /* ================= MENU ================= */

        MenuCreateRequest: {
          type: "object",
          required: ["name", "price", "category"],
          properties: {
            name: { type: "string", example: "Paneer Butter Masala" },
            description: { type: "string", example: "Creamy Paneer Dish" },
            price: { type: "number", example: 220 },
            isVeg: { type: "boolean", example: true },
            category: { type: "string", example: "categoryId" }
          }
        },


        /* ================= ADDON CATEGORY ================= */

        AddonCategoryCreateRequest: {
          type: "object",
          required: ["name", "menuItem"],
          properties: {
            name: { type: "string", example: "Extra Toppings" },
            isRequired: { type: "boolean", example: false },
            maxSelection: { type: "number", example: 4 },
            menuItem: { type: "string", example: "menuItemId" }
          }
        },


        /* ================= ADDON ITEM ================= */

        AddonItemCreateRequest: {
          type: "object",
          required: ["name", "price", "addonCategory"],
          properties: {
            name: { type: "string", example: "Extra Cheese" },
            price: { type: "number", example: 30 },
            addonCategory: { type: "string", example: "addonCategoryId" }
          }
        }

      },
    },
  },

  /* ================= ROUTE FILE PATHS ================= */

  apis: [
    "./src/routes/*.js",
    "./src/routes/admin/*.js" // ⭐ IMPORTANT FOR ADMIN
  ],
};

module.exports = swaggerJSDoc(options);
