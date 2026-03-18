# Campaign Group Policies and Protocols

## Overview
This document outlines the official Cruise Brothers (CB) group policies and translates them into actionable protocols for the Leisure Life Interactive automated campaign system. Adherence to these protocols ensures that our automated system maximizes profitability (Tour Conductor credits) while protecting both the agency and the guests.

---

## Key Policies & System Protocols

### 1. The 90-Day Group Survival Window
**CB Policy Context:**
*"If an agent opens a group and does not sell any inventory within 90 days, Cruise Brothers reserves the right to convert the group to a CB House group or cancel it at the cruise line without notice."*

**Automated System Protocol:**
- **The "Pulse" Booking:** The system must secure at least **one (1) fully deposited cabin** within precisely 90 days of the group block being opened in order to keep the campaign alive under our agency's ownership.
- **Alert Logic:** Implement a 90-day ticking clock visible on the campaign dashboard. If a campaign hits Day 75 with 0 booked inventory, it should trigger an urgent alert or an automated "Save the Block" promotion to generate a quick booking.

### 2. The 8-Cabin Minimum Threshold (Tour Conductors)
**CB Policy Context:**
A Tour Conductor (TC) credit is paid when a group reaches at least **8 cabins**. If a group fails to meet this minimum natively natively, Cruise Brothers' group department will advise that they are opening the inventory for sale to other agents (converting it to a "House Group"). If outside (unrelated) cabins are added to reach the 8, the originating agent does not earn the TC.

**Automated System Protocol:**
- **The Golden Metric:** The primary goal of any themed campaign is to cross the 8-cabin threshold to unlock the TC profitability bonus.
- **Fail-Safe Reality:** If a campaign stalls gracefully at 4-7 cabins, the campaign is technically "failed" from a max-profit perspective (losing the TC credit), but it is NOT catastrophic. The guests keep their vacations and locked-in rates, and we retain standard commission. 
- **Inventory Tracking:** The backend must only track *our own* campaign sales toward the 8-cabin goal. If CB fills the rest of the block manually, our campaign logic must disregard those external cabins for TC calculations.

### 3. Deposits and Guest Protection
**CB Policy Context:**
*"Agents are not allowed to hold reservations in a group. Full deposit must be made to secure the group reservation."* Deposit amounts are not flat but are determined *"as indicated by cruise line."*

**Automated System Protocol:**
- **No Ghost Holds:** The automated booking funnel cannot submit "held" cabins to Cruise Brothers without taking payment.
- **Dynamic Deposit Checking:** The system must actively query or know the specific cruise line's deposit requirement (e.g., $250 for Royal Caribbean vs. $150 for Carnival) and enforce a collection of that minimum standard deposit to confirm the campaign sale.
- **Guest Assurance:** Because the system requires a full deposit upfront for the booking to be logged, every guest within the campaign is mathematically protected. Their cabin is secured regardless of whether the overarching group campaign reaches the 8-cabin threshold or turns into a House Group.

### 4. Group Reconciliation Timelines
**CB Policy Context:**
Groups are reconciled **30-45 days prior** to sailing, while agent responsibility states that final payments from customers are due **100-135 days before** sailing.

**Automated System Protocol:**
- **Deadline Enforcement:** All campaign automation logic must consider the 135-day mark as the "Final Payment Absolute Deadline." 
- Automated reminder sequences (emails/SMS) for campaign participants must kick in well ahead of the 135-day line to prevent reservations from being dropped.
