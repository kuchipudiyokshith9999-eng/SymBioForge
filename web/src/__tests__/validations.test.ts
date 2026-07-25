import { factoryRegistrationSchema } from "../lib/validations"
import * as assert from "assert"

function runTests() {
  console.log("Running validations.test.ts...")
  
  // Test 1: Valid payload
  const validPayload = {
    name: "Test Factory",
    industryType: "Textiles",
    location: {
      lat: 12.34,
      lng: 56.78,
      address: "123 Industrial Area"
    },
    productionCapacity: "1000 tons/month",
    rawMaterials: ["Cotton"],
    declaredWastes: ["Cotton waste"]
  }
  
  const result1 = factoryRegistrationSchema.safeParse(validPayload)
  assert.ok(result1.success, "Valid payload should be accepted")
  
  // Test 2: Missing required fields
  const invalidPayload = {
    name: "T", // Too short
    industryType: "Textiles",
    location: {
      lat: 120, // Invalid lat
      lng: 56.78,
      address: "" // Empty address
    },
    productionCapacity: "1000 tons/month",
    rawMaterials: [], // Empty array
    declaredWastes: ["Cotton waste"]
  }
  
  const result2 = factoryRegistrationSchema.safeParse(invalidPayload)
  assert.ok(!result2.success, "Invalid payload should be rejected")
  if (!result2.success) {
    const errors = result2.error.errors.map(e => e.path.join(".") + ": " + e.message)
    assert.ok(errors.includes("name: Name must be at least 2 characters"))
    assert.ok(errors.includes("location.lat: Invalid latitude"))
    assert.ok(errors.includes("location.address: Address is required"))
    assert.ok(errors.includes("rawMaterials: At least one raw material is required"))
  }
  
  console.log("All validation tests passed successfully!")
}

runTests()
