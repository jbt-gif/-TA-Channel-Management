import { prisma } from "../lib/prisma.js";

const HOTEL_ID = "cmszkjuqr0000uaq4i7qcwuua";
const ROOM_TYPE_ID = "cmszkjv8h0002uaq4lv2s3fld";
const RATE_PLAN_ID = "cmszkjvys0008uaq4er9k8nyp";
const CHANNEX_ROOM_TYPE_ID = "058cbf37-2bea-4075-ba6d-fe6e91304c09";
const CHANNEX_RATE_PLAN_ID = "ce3abdb1-73bf-4639-948d-4384f9005876";

async function main() {
  await prisma.channelMapping.upsert({
    where: { hotelId_mappingType_externalId: { hotelId: HOTEL_ID, mappingType: "ROOM_TYPE", externalId: CHANNEX_ROOM_TYPE_ID } },
    create: { hotelId: HOTEL_ID, mappingType: "ROOM_TYPE", roomTypeId: ROOM_TYPE_ID, externalId: CHANNEX_ROOM_TYPE_ID },
    update: { roomTypeId: ROOM_TYPE_ID },
  });

  await prisma.channelMapping.upsert({
    where: { hotelId_mappingType_externalId: { hotelId: HOTEL_ID, mappingType: "RATE_PLAN", externalId: CHANNEX_RATE_PLAN_ID } },
    create: { hotelId: HOTEL_ID, mappingType: "RATE_PLAN", ratePlanId: RATE_PLAN_ID, externalId: CHANNEX_RATE_PLAN_ID },
    update: { ratePlanId: RATE_PLAN_ID },
  });

  const mappings = await prisma.channelMapping.findMany({ where: { hotelId: HOTEL_ID } });
  console.log(mappings);
}

main()
  .catch((err) => {
    console.error("Mapping failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
