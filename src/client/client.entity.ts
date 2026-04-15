import { Entity, Column, OneToMany, PrimaryColumn } from "typeorm";

@Entity("clients")
export class Client {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true, name: "company_name" })
  companyName: string;

  @Column({ default: 0 })
  deleted: boolean;

  @Column({ name: "created_at", type: "bigint" })
  createdAt: number;

  @Column({ name: "domain", unique: true })
  domain: string;

  @Column({ name: "logo_key", nullable: true, type: "varchar", length: 512 })
  logoKey: string;
}
