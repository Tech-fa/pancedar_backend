import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ClientBaseEntity } from "../client/client-base";
import { bigintTransformer } from "../util/bigint-transformer";

@Entity("locations")
export class Location extends ClientBaseEntity {

  constructor(data: Partial<Location>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn("uuid")
  id: string;


  @Column({ name: "address", type: "text", nullable: true })
  address: string | null;

  @Column({ name: "city", type: "varchar", length: 100, nullable: true })
  city: string | null;

  @Column({ name: "state", type: "varchar", length: 100, nullable: true })
  state: string | null;

  @Column({ name: "country", type: "varchar", length: 100, nullable: true })
  country: string | null;

  @Column({ name: "postal_code", type: "varchar", length: 20, nullable: true })
  postalCode: string | null;

  @Column({
    name: "latitude",
    type: "decimal",
    precision: 10,
    scale: 7,
    nullable: true,
  })
  latitude: number | null;

  @Column({
    name: "longitude",
    type: "decimal",
    precision: 10,
    scale: 7,
    nullable: true,
  })
  longitude: number | null;

  @Column({
    name: "created_at",
    type: "bigint",
    transformer: bigintTransformer,
  })
  createdAt: number;

  @Column({
    name: "updated_at",
    type: "bigint",
    transformer: bigintTransformer,
  })
  updatedAt: number;
}
