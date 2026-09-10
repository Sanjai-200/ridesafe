import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || user.role !== 'DRIVER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeTrip = await prisma.trip.findFirst({
            where: { driverId: user.id, status: { not: 'TRIP_COMPLETED' } },
            include: {
                route: {
                    include: {
                        stops: {
                            orderBy: { order: 'asc' },
                            include: {
                                pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                attendances: { where: { trip: { status: { not: 'TRIP_COMPLETED' } } } }
                            }
                        }
                    }
                }
            }
        })

        let bus = await prisma.bus.findFirst({
            where: { driverId: user.id },
            include: {
                route: {
                    include: {
                        stops: {
                            orderBy: { order: 'asc' },
                            include: {
                                pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                            }
                        },
                        students: { select: { id: true } }
                    }
                }
            }
        })

        // If no bus or no route assigned to this driver, auto-link to active fleet route so driver is never stranded
        if (!bus || !bus.route) {
            // Find any bus that has a route
            const candidateBus = await prisma.bus.findFirst({
                where: { routeId: { not: null } },
                include: {
                    route: {
                        include: {
                            stops: {
                                orderBy: { order: 'asc' },
                                include: {
                                    pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                    dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                }
                            },
                            students: { select: { id: true } }
                        }
                    }
                }
            })

            if (candidateBus) {
                bus = await prisma.bus.update({
                    where: { id: candidateBus.id },
                    data: { driverId: user.id },
                    include: {
                        route: {
                            include: {
                                stops: {
                                    orderBy: { order: 'asc' },
                                    include: {
                                        pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                        dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                    }
                                },
                                students: { select: { id: true } }
                            }
                        }
                    }
                })
            } else {
                // Check if any route exists, otherwise create Route A
                let route = await prisma.route.findFirst({
                    include: {
                        stops: {
                            orderBy: { order: 'asc' },
                            include: {
                                pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                            }
                        },
                        students: { select: { id: true } }
                    }
                })

                if (!route) {
                    route = await prisma.route.create({
                        data: {
                            name: 'Morning Route A',
                            morningTime: '7:30 AM',
                            afternoonTime: '3:00 PM',
                            stops: {
                                create: [
                                    { name: 'Taman Desa Stop', latitude: 3.1030, longitude: 101.6870, order: 1 },
                                    { name: 'Sri Petaling Gate', latitude: 3.0890, longitude: 101.6980, order: 2 },
                                    { name: 'Mont Kiara Academy', latitude: 3.1670, longitude: 101.6520, order: 3 },
                                ]
                            }
                        },
                        include: {
                            stops: {
                                orderBy: { order: 'asc' },
                                include: {
                                    pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                    dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                }
                            },
                            students: { select: { id: true } }
                        }
                    })

                    // Seed sample students
                    const stops = route.stops
                    if (stops.length >= 2) {
                        await prisma.student.createMany({
                            data: [
                                { name: 'Timmy Chen', grade: 'Grade 3', level: 'Primary', parentContact1: '+60 12-345 6789', routeId: route.id, pickupStopId: stops[0].id, dropoffStopId: stops[1].id },
                                { name: 'Sarah Lee', grade: 'Grade 1', level: 'Primary', parentContact1: '+60 12-987 6543', routeId: route.id, pickupStopId: stops[1].id, dropoffStopId: stops[0].id, isSelfPickup: true },
                                { name: 'Lucas Wong', grade: 'Grade 4', level: 'Primary', parentContact1: '+60 17-555 4321', routeId: route.id, pickupStopId: stops[0].id, dropoffStopId: stops[2].id },
                            ]
                        })
                    }
                }

                // Create or link bus to this driver
                const existingBus = await prisma.bus.findFirst({ where: { driverId: user.id } })
                if (existingBus) {
                    bus = await prisma.bus.update({
                        where: { id: existingBus.id },
                        data: { routeId: route.id, qrToken: existingBus.qrToken || 'QR-BUS-001' },
                        include: {
                            route: {
                                include: {
                                    stops: {
                                        orderBy: { order: 'asc' },
                                        include: {
                                            pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                            dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                        }
                                    },
                                    students: { select: { id: true } }
                                }
                            }
                        }
                    })
                } else {
                    bus = await prisma.bus.create({
                        data: {
                            plateNumber: 'BUS-001',
                            capacity: 32,
                            status: 'ACTIVE',
                            driverId: user.id,
                            routeId: route.id,
                            qrToken: 'QR-BUS-001',
                        },
                        include: {
                            route: {
                                include: {
                                    stops: {
                                        orderBy: { order: 'asc' },
                                        include: {
                                            pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                            dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                        }
                                    },
                                    students: { select: { id: true } }
                                }
                            }
                        }
                    })
                }
            }
        }

        // Auto-generate a qrToken for the bus if one doesn't exist yet
        let busQrToken = bus?.qrToken || null
        if (bus && !busQrToken) {
            busQrToken = 'QR-' + Math.random().toString(36).substring(2, 12).toUpperCase()
            await prisma.bus.update({ where: { id: bus.id }, data: { qrToken: busQrToken } })
        }

        return NextResponse.json({
            activeTrip,
            assignedRoute: bus?.route || null,
            busId: bus?.id || null,
            busPlate: bus?.plateNumber || null,
            busQrToken,
            driverId: user.id,
        })
    } catch (error) {
        console.error('Driver Status GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
